// notificar-pendencias — transforma prazo e criação de pendência em push.
//
// Fluxo:
//   cron (pg_cron) → esta função → POST send-push (service role) → Expo
//
// Ela não fala com o Expo direto de propósito: quem conhece tokens, dedupe e
// ledger é a `send-push`. Aqui mora só a REGRA (o que merece push e com que
// texto), e o envio continua tendo um caminho só.
//
// Modos:
//   'prazos' — pendências vencidas e a vencer (roda 1x/dia).
//   'novas'  — pendências criadas na última janela (roda de 10 em 10 min).
//   'tudo'   — os dois, para teste manual.
//
// `simular: true` devolve exatamente o que seria enviado, sem enviar nada.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push`;

// `data_limite` é DATE, sem fuso. Comparar com a data UTC erraria o dia inteiro
// entre 21h e meia-noite no Brasil — "vence hoje" viraria "venceu ontem".
const FUSO = 'America/Sao_Paulo';

/** Mesma antecedência que a central de notificações do app usa. */
const DIAS_ANTECEDENCIA = 3;

/** Folga sobre o intervalo do cron (10 min): perder uma execução não perde push. */
const JANELA_NOVAS_MIN = 25;

/** Acima disso vira um push agregado — 20 notificações seguidas ninguém lê. */
const LIMITE_INDIVIDUAL = 3;

type Tipo = 'vencida' | 'proxima_vencimento' | 'nova_pendencia';
type Modo = 'prazos' | 'novas' | 'tudo';

interface Envio {
  escritorio_id: string;
  tipo: Tipo;
  titulo: string;
  mensagem: string;
  pendencia_id?: string;
  cliente_id?: string;
  chave_dedupe: string;
}

interface PendenciaRow {
  id: string;
  escritorio_id: string;
  cliente_id: string | null;
  nome_documento: string;
  data_limite: string | null;
  created_at: string;
  pendix_clientes: { nome: string } | { nome: string }[] | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Data de hoje (yyyy-mm-dd) no fuso do escritório. */
function hojeLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function somarDias(iso: string, dias: number): string {
  // Meio-dia UTC: longe o bastante das bordas para horário de verão não mover o dia.
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function formatarBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function nomeCliente(p: PendenciaRow): string {
  const c = p.pendix_clientes;
  if (!c) return 'Cliente';
  return (Array.isArray(c) ? c[0]?.nome : c.nome) ?? 'Cliente';
}

/** "A, B e mais 4" — cabe na linha da notificação sem virar parede de texto. */
function listarClientes(ps: PendenciaRow[], mostrar = 2): string {
  const nomes = [...new Set(ps.map(nomeCliente))];
  if (nomes.length <= mostrar) return nomes.join(', ');
  return `${nomes.slice(0, mostrar).join(', ')} e mais ${nomes.length - mostrar}`;
}

function agrupar(ps: PendenciaRow[]): Map<string, PendenciaRow[]> {
  const mapa = new Map<string, PendenciaRow[]>();
  for (const p of ps) {
    const lista = mapa.get(p.escritorio_id);
    if (lista) lista.push(p);
    else mapa.set(p.escritorio_id, [p]);
  }
  return mapa;
}

// ── Regras ──────────────────────────────────────────────────────────────────

/**
 * Vencidas e a vencer. As chaves de dedupe individuais são as MESMAS que
 * `getPendixNotificacoesDerivadas` gera no app (`vencida-<id>`,
 * `vencimento-<id>`): assim o push não repete o que o usuário já leu ou
 * dispensou na central de notificações, e vice-versa.
 */
async function montarPrazos(admin: SupabaseClient): Promise<Envio[]> {
  const hoje = hojeLocal();
  const limite = somarDias(hoje, DIAS_ANTECEDENCIA);

  const { data, error } = await admin
    .from('pendix_pendencias')
    .select('id, escritorio_id, cliente_id, nome_documento, data_limite, created_at, pendix_clientes(nome)')
    .eq('status', 'pendente')
    .not('data_limite', 'is', null)
    .lte('data_limite', limite)
    .order('data_limite', { ascending: true });

  if (error) throw new Error(`Falha ao ler pendências: ${error.message}`);

  const envios: Envio[] = [];

  for (const [escritorioId, todas] of agrupar((data ?? []) as PendenciaRow[])) {
    const vencidas = todas.filter((p) => p.data_limite! < hoje);
    const proximas = todas.filter((p) => p.data_limite! >= hoje);

    if (vencidas.length > LIMITE_INDIVIDUAL) {
      envios.push({
        escritorio_id: escritorioId,
        tipo: 'vencida',
        titulo: `${vencidas.length} pendências vencidas`,
        mensagem: `${listarClientes(vencidas)} ainda não enviaram os documentos.`,
        chave_dedupe: `vencidas-${escritorioId}-${hoje}`,
      });
    } else {
      for (const p of vencidas) {
        envios.push({
          escritorio_id: escritorioId,
          tipo: 'vencida',
          titulo: `${p.nome_documento} vencida`,
          mensagem: `${nomeCliente(p)} ainda não enviou — venceu em ${formatarBR(p.data_limite!)}.`,
          pendencia_id: p.id,
          cliente_id: p.cliente_id ?? undefined,
          chave_dedupe: `vencida-${p.id}`,
        });
      }
    }

    if (proximas.length > LIMITE_INDIVIDUAL) {
      envios.push({
        escritorio_id: escritorioId,
        tipo: 'proxima_vencimento',
        titulo: `${proximas.length} pendências vencem em breve`,
        mensagem: `${listarClientes(proximas)} — prazo em até ${DIAS_ANTECEDENCIA} dias.`,
        chave_dedupe: `vencimentos-${escritorioId}-${hoje}`,
      });
    } else {
      for (const p of proximas) {
        envios.push({
          escritorio_id: escritorioId,
          tipo: 'proxima_vencimento',
          titulo: `${p.nome_documento} vence em breve`,
          mensagem: `${nomeCliente(p)} — prazo em ${formatarBR(p.data_limite!)}.`,
          pendencia_id: p.id,
          cliente_id: p.cliente_id ?? undefined,
          chave_dedupe: `vencimento-${p.id}`,
        });
      }
    }
  }

  return envios;
}

/**
 * Pendências criadas na última janela. Vai para todos os aparelhos do
 * escritório — inclusive o de quem criou, porque `pendix_pendencias` não
 * guarda o autor. Se um dia guardar, dá para excluir o autor aqui.
 */
async function montarNovas(admin: SupabaseClient): Promise<Envio[]> {
  const desde = new Date(Date.now() - JANELA_NOVAS_MIN * 60_000).toISOString();

  const { data, error } = await admin
    .from('pendix_pendencias')
    .select('id, escritorio_id, cliente_id, nome_documento, data_limite, created_at, pendix_clientes(nome)')
    .gte('created_at', desde)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Falha ao ler pendências novas: ${error.message}`);

  const envios: Envio[] = [];

  for (const [escritorioId, novas] of agrupar((data ?? []) as PendenciaRow[])) {
    if (novas.length > LIMITE_INDIVIDUAL) {
      envios.push({
        escritorio_id: escritorioId,
        tipo: 'nova_pendencia',
        titulo: `${novas.length} novas pendências`,
        mensagem: `${listarClientes(novas)} — abertas agora há pouco.`,
        // A janela anda a cada execução, então a chave também — sem isso o
        // agregado só sairia uma vez na vida.
        chave_dedupe: `novas-${escritorioId}-${desde.slice(0, 16)}`,
      });
      continue;
    }

    for (const p of novas) {
      const prazo = p.data_limite ? ` — prazo ${formatarBR(p.data_limite)}` : '';
      envios.push({
        escritorio_id: escritorioId,
        tipo: 'nova_pendencia',
        titulo: 'Nova pendência',
        mensagem: `${nomeCliente(p)}: ${p.nome_documento}${prazo}.`,
        pendencia_id: p.id,
        cliente_id: p.cliente_id ?? undefined,
        chave_dedupe: `nova_pendencia-${p.id}`,
      });
    }
  }

  return envios;
}

// ── Envio ───────────────────────────────────────────────────────────────────

async function despachar(envio: Envio): Promise<{ ok: boolean; detalhe: unknown }> {
  // Service role: é o único jeito de mandar em nome de um escritório que não é
  // o do chamador — aqui não há usuário nenhum, quem chamou foi o cron.
  const resp = await fetch(SEND_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(envio),
  });

  let corpo: unknown;
  try {
    corpo = await resp.json();
  } catch {
    corpo = { erro: `Resposta não-JSON (HTTP ${resp.status})` };
  }
  return { ok: resp.ok, detalhe: corpo };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  if (!SERVICE_ROLE_KEY) return json({ erro: 'SUPABASE_SERVICE_ROLE_KEY ausente.' }, 500);

  let modo: Modo = 'tudo';
  let simular = false;
  try {
    const body = await req.json();
    if (body?.modo) modo = body.modo;
    simular = body?.simular === true;
  } catch {
    // corpo vazio é válido: cai no padrão.
  }

  if (!['prazos', 'novas', 'tudo'].includes(modo)) {
    return json({ erro: `modo inválido: ${modo}` }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let envios: Envio[];
  try {
    envios = [
      ...(modo === 'prazos' || modo === 'tudo' ? await montarPrazos(admin) : []),
      ...(modo === 'novas' || modo === 'tudo' ? await montarNovas(admin) : []),
    ];
  } catch (err) {
    return json({ erro: err instanceof Error ? err.message : String(err) }, 500);
  }

  if (simular) {
    return json({ ok: true, modo, simulado: true, total: envios.length, envios });
  }

  // Sequencial: são poucos por execução e assim uma falha não derruba o resto.
  const resultados = [];
  for (const envio of envios) {
    const r = await despachar(envio);
    resultados.push({ chave: envio.chave_dedupe, ok: r.ok, resposta: r.detalhe });
  }

  return json({
    ok: true,
    modo,
    total: envios.length,
    enviados: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    resultados,
  });
});
