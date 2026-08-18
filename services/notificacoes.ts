import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import type { PendixNotificacaoDerivada } from '@/services/pendix';

// ── Push (Expo Push Service) ────────────────────────────────────────────────
// O app pega um Expo push token e grava em pendix_dispositivos. Quem envia é a
// Edge Function, que faz POST em exp.host/--/api/v2/push/send — o segredo do
// FCM nunca entra no bundle. No Android o Expo usa FCM por baixo, então a
// credencial FCM V1 precisa estar no projeto EAS.

export const CANAL_PADRAO = 'default';

const INSTALL_ID_KEY = 'pendix.install_id';
const ULTIMO_TOKEN_KEY = 'pendix.expo_push_token';

/**
 * Expo Go no Android: desde o SDK 53 o `expo-notifications` LANÇA já ao ser
 * carregado, não só ao usar push remoto. Um `import` estático derruba tudo que
 * importar este arquivo (AuthContext → _layout → app inteiro), então o módulo
 * é carregado sob demanda e só depois de checar o ambiente.
 *
 * `import type` acima é apagado na compilação — serve só para tipagem.
 */
let moduloCache: typeof NotificationsModule | null | undefined;

export function getNotifications(): typeof NotificationsModule | null {
  if (moduloCache !== undefined) return moduloCache;
  if (!notificacoesDisponiveis()) {
    moduloCache = null;
    return null;
  }
  try {
    moduloCache = require('expo-notifications') as typeof NotificationsModule;
  } catch (err) {
    console.warn('[Notificações] expo-notifications indisponível:', err);
    moduloCache = null;
  }
  return moduloCache;
}

/** Se `false`, nem sequer dá para carregar o módulo (Expo Go no Android). */
export function notificacoesDisponiveis(): boolean {
  const noExpoGo = Constants.executionEnvironment === 'storeClient';
  return !(noExpoGo && Platform.OS === 'android');
}

let handlerConfigurado = false;

/** Decide o que fazer com uma notificação que chega com o app aberto. */
export function configurarHandlerNotificacoes() {
  if (handlerConfigurado) return;
  const N = getNotifications();
  if (!N) return;
  handlerConfigurado = true;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Assina o toque na notificação. Devolve uma função para cancelar, ou null se
 * as notificações não existem neste ambiente.
 */
export function ouvirToqueEmNotificacao(
  cb: (dados: { pendencia_id?: string }) => void,
): (() => void) | null {
  const N = getNotifications();
  if (!N) return null;
  const sub = N.addNotificationResponseReceivedListener((resposta) => {
    cb((resposta.notification.request.content.data ?? {}) as { pendencia_id?: string });
  });
  return () => sub.remove();
}

/**
 * Android 8+ exige canal. No Android 13+ o canal precisa existir *antes* de
 * pedir o token, senão o prompt de permissão não aparece.
 */
export async function garantirCanalAndroid() {
  if (Platform.OS !== 'android') return;
  const N = getNotifications();
  if (!N) return;
  await N.setNotificationChannelAsync(CANAL_PADRAO, {
    name: 'Pendências',
    importance: N.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#a78bfa',
  });
}

/**
 * Push remoto no Android saiu do Expo Go no SDK 53 — exige development build.
 * No iOS o Expo Go ainda funciona.
 */
export function pushSuportadoNesteBuild(): boolean {
  return notificacoesDisponiveis();
}

function getProjectId(): string | null {
  const extra = (Constants.expoConfig as any)?.extra?.eas?.projectId;
  const easCfg = (Constants as any)?.easConfig?.projectId;
  return extra ?? easCfg ?? null;
}

function plataformaSuportada(): 'android' | 'ios' | 'web' {
  if (Platform.OS === 'android' || Platform.OS === 'ios') return Platform.OS;
  return 'web';
}

/** Id estável por instalação. O push token rotaciona; este id não. */
async function getInstallId(): Promise<string> {
  let id = await AsyncStorage.getItem(INSTALL_ID_KEY);
  if (!id) {
    id = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(INSTALL_ID_KEY, id);
  }
  return id;
}

export type RegistroPushFalha =
  | 'sem_sessao'
  | 'push_indisponivel_no_expo_go'
  | 'permissao_negada'
  | 'sem_project_id'
  | 'erro';

export type RegistroPushResultado =
  | { ok: true; token: string }
  | { ok: false; motivo: RegistroPushFalha; detalhe?: string };

/** Mensagem pronta para UI — cada falha tem uma ação diferente do usuário. */
export function explicarFalhaPush(motivo: RegistroPushFalha): string {
  switch (motivo) {
    case 'sem_sessao':
      return 'Faça login para receber notificações.';
    case 'push_indisponivel_no_expo_go':
      return 'Push no Android não funciona no Expo Go (removido no SDK 53). Use um development build.';
    case 'permissao_negada':
      return 'Permissão de notificações negada. Ative nas configurações do sistema.';
    case 'sem_project_id':
      return 'Projeto EAS não configurado — rode `eas init` para gerar o projectId.';
    case 'erro':
      return 'Não foi possível registrar este dispositivo para notificações.';
  }
}

/**
 * Pede permissão, obtém o Expo push token e grava/atualiza o dispositivo.
 * Nunca lança: devolve o motivo da falha para a UI decidir o que dizer.
 */
export async function registrarDispositivoPush(): Promise<RegistroPushResultado> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { ok: false, motivo: 'sem_sessao' };

  const N = getNotifications();
  if (!N) return { ok: false, motivo: 'push_indisponivel_no_expo_go' };

  try {
    await garantirCanalAndroid();

    const atual = await N.getPermissionsAsync();
    let status = atual.status;
    if (status !== 'granted') {
      status = (await N.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return { ok: false, motivo: 'permissao_negada' };

    const projectId = getProjectId();
    if (!projectId) return { ok: false, motivo: 'sem_project_id' };

    const { data: expoPushToken } = await N.getExpoPushTokenAsync({ projectId });

    // Token nativo (FCM/APNs) só para diagnóstico — enviar via Expo não precisa dele.
    let devicePushToken: string | null = null;
    try {
      const nativo = await N.getDevicePushTokenAsync();
      devicePushToken = typeof nativo.data === 'string' ? nativo.data : JSON.stringify(nativo.data);
    } catch {
      // sem token nativo não impede nada
    }

    // O escritório vem da tabela `usuarios`, que é o que a RLS enxerga — o
    // officeId do AuthContext pode vir do user_metadata e divergir.
    const { data: perfil } = await supabase
      .from('usuarios').select('escritorio_id').eq('id', session.user.id).maybeSingle();

    const agora = new Date().toISOString();
    const { error } = await supabase.from('pendix_dispositivos').upsert({
      usuario_id: session.user.id,
      escritorio_id: perfil?.escritorio_id ?? null,
      expo_push_token: expoPushToken,
      device_push_token: devicePushToken,
      plataforma: plataformaSuportada(),
      device_id: await getInstallId(),
      device_nome: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || null,
      app_version: Constants.expoConfig?.version ?? null,
      ativo: true,
      ultimo_acesso: agora,
      updated_at: agora,
    }, { onConflict: 'expo_push_token' });

    if (error) return { ok: false, motivo: 'erro', detalhe: error.message };

    await AsyncStorage.setItem(ULTIMO_TOKEN_KEY, expoPushToken);
    return { ok: true, token: expoPushToken };
  } catch (err: any) {
    return { ok: false, motivo: 'erro', detalhe: err?.message ?? String(err) };
  }
}

/**
 * Marca o dispositivo como inativo. Precisa rodar ANTES do signOut — depois de
 * encerrar a sessão a RLS bloqueia o update.
 */
export async function desativarDispositivoAtual(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(ULTIMO_TOKEN_KEY);
    if (!token) return;
    await supabase
      .from('pendix_dispositivos')
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq('expo_push_token', token);
  } catch (err) {
    console.warn('[Notificações] Falha ao desativar dispositivo:', err);
  }
}

// ── Teste e diagnóstico ─────────────────────────────────────────────────────

export interface DiagnosticoPush {
  ambiente: 'Expo Go' | 'Development build' | 'Build de produção';
  pushRemotoSuportado: boolean;
  permissao: 'granted' | 'denied' | 'undetermined';
  projectId: string | null;
  tokenRegistrado: string | null;
  /** Explicação do porquê o push remoto não está disponível, se for o caso. */
  impedimento: string | null;
}

export async function diagnosticoPush(): Promise<DiagnosticoPush> {
  const execEnv = Constants.executionEnvironment;
  const ambiente: DiagnosticoPush['ambiente'] =
    execEnv === 'storeClient' ? 'Expo Go'
    : execEnv === 'standalone' ? 'Build de produção'
    : 'Development build';

  const N = getNotifications();
  const suportado = N !== null;
  const projectId = getProjectId();
  const tokenRegistrado = await AsyncStorage.getItem(ULTIMO_TOKEN_KEY);

  // Sem o módulo não dá nem para consultar a permissão.
  const perm = N
    ? await N.getPermissionsAsync()
    : { status: 'undetermined' as const };

  let impedimento: string | null = null;
  if (!suportado) {
    impedimento = 'expo-notifications não carrega no Expo Go (Android) desde o SDK 53 — nem local, nem push. Instale o development build.';
  } else if (perm.status !== 'granted') {
    impedimento = 'Permissão de notificações não concedida.';
  } else if (!projectId) {
    impedimento = 'Projeto EAS não configurado (extra.eas.projectId ausente).';
  }

  return {
    ambiente,
    pushRemotoSuportado: suportado,
    permissao: perm.status as DiagnosticoPush['permissao'],
    projectId,
    tokenRegistrado,
    impedimento,
  };
}

/**
 * Dispara uma notificação local imediata — valida permissão, canal, handler e
 * o deep link ao tocar, sem depender de servidor. Indisponível no Expo Go do
 * Android, onde o próprio módulo não carrega.
 */
export async function enviarNotificacaoTesteLocal(pendenciaId?: string): Promise<void> {
  const N = getNotifications();
  if (!N) {
    throw new Error(
      'Notificações não funcionam no Expo Go do Android desde o SDK 53. Instale o development build para testar.',
    );
  }

  await garantirCanalAndroid();

  const atual = await N.getPermissionsAsync();
  let status = atual.status;
  if (status !== 'granted') {
    status = (await N.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    throw new Error('Permissão de notificações negada. Ative nas configurações do sistema.');
  }

  await N.scheduleNotificationAsync({
    content: {
      title: '🔔 Pendix',
      body: pendenciaId
        ? 'Teste: as notificações funcionam. Toque para abrir a pendência.'
        : 'Teste: as notificações estão funcionando!',
      data: pendenciaId ? { pendencia_id: pendenciaId } : {},
    },
    trigger: null, // imediata
  });
}

// ── Envio pelo servidor (Edge Function send-push) ───────────────────────────

export interface ResultadoPushServidor {
  ok: boolean;
  status?: 'enviado' | 'falhou';
  dispositivos?: number;
  tickets_ok?: number;
  tickets_erro?: number;
  tokens_desativados?: number;
  aviso?: string;
  erro?: string | null;
}

/**
 * Chama a Edge Function `send-push` com a sessão do usuário — o mesmo caminho
 * que os eventos reais (pendência vencida, documento recebido) vão usar. O
 * escritório é derivado do JWT no servidor, então não dá para disparar push
 * para outro tenant a partir daqui.
 */
export async function enviarPushViaServidor(payload: {
  tipo: 'vencida' | 'proxima_vencimento' | 'cliente_respondeu'
      | 'documento_recebido' | 'nova_pendencia' | 'teste';
  titulo: string;
  mensagem?: string;
  pendencia_id?: string;
  cliente_id?: string;
  chave_dedupe?: string;
}): Promise<ResultadoPushServidor> {
  const { data, error } = await supabase.functions.invoke('send-push', { body: payload });

  if (error) {
    // A função devolve o motivo no corpo; o supabase-js embrulha isso em
    // `context`, então sem desembrulhar sobra só "Edge Function returned a
    // non-2xx status code", que não ajuda ninguém a diagnosticar.
    let detalhe = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const corpo = await ctx.json();
        if (corpo?.erro) detalhe = corpo.erro;
      }
    } catch {
      // mantém a mensagem original
    }
    return { ok: false, erro: detalhe };
  }

  return (data ?? { ok: false, erro: 'Resposta vazia.' }) as ResultadoPushServidor;
}

// ── Estado de leitura das notificações ──────────────────────────────────────
// A central de notificações é derivada de pendências + histórico em tempo real
// (getPendixNotificacoesDerivadas). Cada item derivado só ganha uma linha em
// pendix_notificacoes quando o usuário interage com ele — a `chave_dedupe`
// guarda o id derivado, que é estável entre sessões.

export interface EstadoNotificacao {
  lido_em: string | null;
  dispensado_em: string | null;
}

export async function getEstadosNotificacoes(): Promise<Map<string, EstadoNotificacao>> {
  const mapa = new Map<string, EstadoNotificacao>();

  // Sem filtro por chave de propósito: um `.in()` com centenas de chaves vira
  // uma query string enorme (o PostgREST monta tudo na URL). A RLS já limita
  // às linhas do próprio usuário e o payload aqui são só três colunas.
  const { data, error } = await supabase
    .from('pendix_notificacoes')
    .select('chave_dedupe, lido_em, dispensado_em')
    .not('chave_dedupe', 'is', null)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) throw error;

  for (const row of data ?? []) {
    if (!row.chave_dedupe) continue;
    mapa.set(row.chave_dedupe, { lido_em: row.lido_em, dispensado_em: row.dispensado_em });
  }
  return mapa;
}

export async function marcarNotificacao(
  n: PendixNotificacaoDerivada,
  opts: { lida?: boolean; dispensada?: boolean },
): Promise<void> {
  const { error } = await supabase.rpc('pendix_marcar_notificacao', {
    p_chave: n.id,
    p_tipo: n.tipo,
    p_titulo: n.titulo,
    p_mensagem: n.descricao,
    p_pendencia_id: n.pendencia_id ?? null,
    p_cliente_id: n.cliente_id ?? null,
    p_lida: opts.lida ?? false,
    p_dispensada: opts.dispensada ?? false,
  });
  if (error) throw error;
}

export async function marcarTodasLidas(ns: PendixNotificacaoDerivada[]): Promise<void> {
  // Sequencial de propósito: são poucas e o erro de uma não deve derrubar as outras.
  for (const n of ns) {
    try {
      await marcarNotificacao(n, { lida: true });
    } catch (err) {
      console.warn('[Notificações] Falha ao marcar lida:', n.id, err);
    }
  }
}
