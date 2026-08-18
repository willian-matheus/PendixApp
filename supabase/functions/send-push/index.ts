// send-push — entrega notificações push do Pendix via Expo Push Service.
//
// Fluxo:
//   payload → resolve destinatários → tokens em pendix_dispositivos
//           → POST exp.host/--/api/v2/push/send → grava resultado
//             em pendix_notificacoes
//
// O segredo do FCM não passa por aqui: quem fala com o Firebase é o Expo,
// usando a credencial FCM V1 do projeto EAS. Esta função só precisa dos
// tokens `ExponentPushToken[...]`.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Limite da API do Expo por requisição.
const TAMANHO_LOTE = 100;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Opcional: só é necessário se a conta Expo tiver "enhanced security" ligado.
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';

interface Payload {
  tipo: 'vencida' | 'proxima_vencimento' | 'cliente_respondeu'
      | 'documento_recebido' | 'nova_pendencia' | 'teste';
  titulo: string;
  mensagem?: string;
  /** Destinatário específico. Ausente = todos os dispositivos do escritório. */
  usuario_id?: string;
  escritorio_id?: string;
  pendencia_id?: string;
  cliente_id?: string;
  /** Identidade estável — impede reenviar a mesma notificação. */
  chave_dedupe?: string;
  dados?: Record<string, unknown>;
}

interface TicketExpo {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Descobre em nome de quem a chamada está sendo feita.
 *
 * Service role (cron, backend) pode mandar para qualquer escritório. Uma
 * chamada com JWT de usuário tem o escritório FORÇADO para o dele — senão
 * qualquer usuário autenticado conseguiria disparar push para outro tenant.
 */
async function resolverEscopo(
  req: Request,
  admin: SupabaseClient,
  payload: Payload,
): Promise<{ escritorioId: string | null; erro?: string }> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');

  if (token && token === SERVICE_ROLE_KEY) {
    return { escritorioId: payload.escritorio_id ?? null };
  }

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { escritorioId: null, erro: 'JWT inválido.' };

  const { data: perfil } = await admin
    .from('usuarios').select('escritorio_id').eq('id', user.id).maybeSingle();

  if (!perfil?.escritorio_id) {
    return { escritorioId: null, erro: 'Usuário sem escritorio_id em public.usuarios.' };
  }
  return { escritorioId: perfil.escritorio_id };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ erro: 'Body não é JSON válido.' }, 400);
  }

  if (!payload?.tipo || !payload?.titulo) {
    return json({ erro: 'Campos obrigatórios: tipo, titulo.' }, 400);
  }

  const { escritorioId, erro } = await resolverEscopo(req, admin, payload);
  if (erro) return json({ erro }, 401);
  if (!escritorioId && !payload.usuario_id) {
    return json({ erro: 'Informe escritorio_id ou usuario_id.' }, 400);
  }

  // ── Dedupe ────────────────────────────────────────────────────────────────
  if (payload.chave_dedupe) {
    const { data: jaEnviada } = await admin
      .from('pendix_notificacoes')
      .select('id')
      .eq('chave_dedupe', payload.chave_dedupe)
      .in('status', ['enviado', 'entregue'])
      .limit(1);

    if (jaEnviada?.length) {
      return json({ ok: true, pulado: 'ja_enviada', enviados: 0 });
    }
  }

  // ── Destinatários ─────────────────────────────────────────────────────────
  let q = admin
    .from('pendix_dispositivos')
    .select('id, usuario_id, expo_push_token')
    .eq('ativo', true);

  if (payload.usuario_id) q = q.eq('usuario_id', payload.usuario_id);
  else q = q.eq('escritorio_id', escritorioId);

  const { data: dispositivos, error: errDisp } = await q;
  if (errDisp) return json({ erro: `Falha ao ler dispositivos: ${errDisp.message}` }, 500);

  if (!dispositivos?.length) {
    return json({ ok: true, enviados: 0, aviso: 'Nenhum dispositivo ativo para o destinatário.' });
  }

  // Um usuário pode ter vários aparelhos; a notificação no ledger é por
  // usuário, não por aparelho.
  const usuarios = [...new Set(dispositivos.map((d) => d.usuario_id))];
  const dados = { ...(payload.dados ?? {}) };
  if (payload.pendencia_id) dados.pendencia_id = payload.pendencia_id;

  // Upsert, não insert: a tentativa anterior pode ter deixado a linha em
  // 'falhou' — ela não bloqueia o dedupe lá em cima, mas colide no índice
  // único. `enviado_em`/`erro` voltam a zero para o resultado desta tentativa
  // não ser lido junto com o erro da anterior.
  const { data: notificacoes, error: errIns } = await admin
    .from('pendix_notificacoes')
    .upsert(usuarios.map((uid) => ({
      escritorio_id: escritorioId,
      usuario_id: uid,
      pendencia_id: payload.pendencia_id ?? null,
      cliente_id: payload.cliente_id ?? null,
      tipo: payload.tipo,
      titulo: payload.titulo,
      mensagem: payload.mensagem ?? '',
      canal: 'push',
      status: 'pendente',
      dados,
      chave_dedupe: payload.chave_dedupe ?? null,
      enviado_em: null,
      erro: null,
    })), { onConflict: 'escritorio_id,usuario_id,chave_dedupe' })
    .select('id, usuario_id');

  if (errIns) return json({ erro: `Falha ao registrar notificação: ${errIns.message}` }, 500);

  // ── Envio ─────────────────────────────────────────────────────────────────
  const mensagens = dispositivos.map((d) => ({
    to: d.expo_push_token,
    title: payload.titulo,
    body: payload.mensagem ?? '',
    data: dados,
    channelId: 'default',
    priority: 'high' as const,
  }));

  const tickets: TicketExpo[] = [];
  let falhaGeral: string | null = null;

  for (let i = 0; i < mensagens.length; i += TAMANHO_LOTE) {
    const lote = mensagens.slice(i, i + TAMANHO_LOTE);
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(lote),
      });
      const corpo = await resp.json();
      if (Array.isArray(corpo?.data)) tickets.push(...corpo.data);
      else falhaGeral = JSON.stringify(corpo?.errors ?? corpo);
    } catch (err) {
      falhaGeral = err instanceof Error ? err.message : String(err);
    }
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  // Desativa tokens que o Expo reportou como mortos, senão eles ficam sendo
  // reenviados para sempre.
  const tokensMortos: string[] = [];
  tickets.forEach((t, idx) => {
    if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') {
      const token = mensagens[idx]?.to;
      if (token) tokensMortos.push(token);
    }
  });

  if (tokensMortos.length) {
    await admin.from('pendix_dispositivos')
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .in('expo_push_token', tokensMortos);
  }

  const houveSucesso = tickets.some((t) => t.status === 'ok');
  const statusFinal = falhaGeral || !houveSucesso ? 'falhou' : 'enviado';
  const mensagemErro = falhaGeral
    ?? tickets.find((t) => t.status === 'error')?.message
    ?? null;

  await admin.from('pendix_notificacoes')
    .update({
      status: statusFinal,
      enviado_em: statusFinal === 'enviado' ? new Date().toISOString() : null,
      erro: statusFinal === 'falhou' ? mensagemErro : null,
    })
    .in('id', (notificacoes ?? []).map((n) => n.id));

  return json({
    ok: statusFinal === 'enviado',
    status: statusFinal,
    dispositivos: dispositivos.length,
    tickets_ok: tickets.filter((t) => t.status === 'ok').length,
    tickets_erro: tickets.filter((t) => t.status === 'error').length,
    tokens_desativados: tokensMortos.length,
    erro: mensagemErro,
  }, statusFinal === 'enviado' ? 200 : 502);
});
