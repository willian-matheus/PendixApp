import { supabase } from '@/lib/supabase';
import { isSuperAdmin, sessionOfficeId } from '@/lib/session';
import { calcularProximaOcorrencia, ehRecorrente, type PendixPeriodicidade } from '@/lib/periodicidade';
import { FREQUENCIA_COBRANCA_PADRAO, inicioDaCobranca, REGRAS_COBRANCA_PADRAO } from '@/lib/cobranca';

export type { PendixPeriodicidade };

// ── Types (espelham server/migrations/pendix/pendix_schema.sql + 021_pendix_agente_whatsapp.sql) ──

export type PendixClienteStatus = 'ativo' | 'inativo' | 'suspenso';
export type PendixClienteTipo = 'pessoa' | 'empresa';
export type PendixRegime = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei';
export type PendixPendenciaStatus = 'pendente' | 'recebido' | 'em_analise' | 'rejeitado' | 'cancelado';
export type PendixNivelCobranca = 'amigavel' | 'lembrete' | 'urgente' | 'critico';
export type PendixPrioridade = 'baixa' | 'media' | 'alta' | 'urgente';
export type PendixPendenciaTipo = 'cliente' | 'empresa';

export interface PendixCliente {
  id: string;
  escritorio_id: string;
  nome: string;
  responsavel: string;
  telefone: string;
  email: string;
  regime: PendixRegime;
  status: PendixClienteStatus;
  observacoes: string;
  tipo?: PendixClienteTipo;
  consentimento_whatsapp?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PendixPendencia {
  id: string;
  escritorio_id: string;
  cliente_id: string;
  documento_id?: string;
  nome_documento: string;
  competencia: string;
  status: PendixPendenciaStatus;
  arquivo_url?: string;
  arquivo_nome?: string;
  observacoes?: string;
  data_limite?: string;
  data_recebimento?: string;
  nivel_cobranca_atual?: PendixNivelCobranca;
  tentativas_reenvio?: number;
  ultima_mensagem_enviada_em?: string;
  requer_revisao_humana?: boolean;
  origem?: 'manual' | 'whatsapp' | 'automatico';
  tipo?: PendixPendenciaTipo;
  descricao?: string;
  prioridade?: PendixPrioridade;
  data_inicio_cobranca?: string;
  horario_notificacao?: string;
  arquivo_modelo_url?: string;
  arquivo_modelo_nome?: string;
  datas_notificacao?: string[];
  datas_notificacao_enviadas?: string[];
  periodicidade?: PendixPeriodicidade;
  /** Pendência que originou esta ocorrência (null quando foi criada à mão). */
  recorrencia_pai_id?: string | null;
  /** Cobrança automática do cliente — ver lib/cobranca.ts. */
  cobranca_automatica?: boolean;
  cobranca_frequencia?: PendixPeriodicidade;
  proxima_cobranca_em?: string | null;
  cobrancas_enviadas?: number;
  created_at: string;
  updated_at: string;
  pendix_clientes?: { id?: string; nome: string; responsavel?: string; telefone?: string; consentimento_whatsapp?: boolean | null };
  pendix_documentos_config?: { descricao_whatsapp?: string; arquivo_modelo_url?: string; arquivo_modelo_nome?: string; prioridade?: string } | null;
}

export interface PendixHistoricoEntry {
  id: string;
  escritorio_id: string;
  pendencia_id?: string;
  cliente_id?: string;
  acao: string;
  descricao?: string;
  usuario_nome?: string;
  created_at: string;
  pendix_clientes?: { id?: string; nome: string };
}

export interface PendixConversa {
  id: string;
  escritorio_id: string;
  pendencia_id: string;
  cliente_id: string;
  telefone: string;
  status: 'ativa' | 'encerrada' | 'escalada_humano';
  resumo?: string;
  criada_em: string;
  atualizada_em: string;
}

export interface PendixMensagem {
  id: string;
  conversa_id: string;
  remetente: 'agente' | 'cliente';
  tipo: 'texto' | 'arquivo';
  conteudo?: string;
  arquivo_url?: string;
  metadata?: Record<string, unknown>;
  criada_em: string;
}

// ── Clientes ───────────────────────────────────────────────────────────────

export async function getPendixClientes() {
  let q = supabase.from('pendix_clientes').select('*').order('nome');
  if (!isSuperAdmin()) {
    const eid = sessionOfficeId();
    if (eid) q = q.eq('escritorio_id', eid);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PendixCliente[];
}

export async function postPendixCliente(p: Omit<PendixCliente, 'id' | 'created_at' | 'updated_at'>) {
  const eid = sessionOfficeId();
  const { data, error } = await supabase
    .from('pendix_clientes')
    .insert({ ...p, escritorio_id: p.escritorio_id || eid })
    .select().single();
  if (error) throw error;
  return data as PendixCliente;
}

export async function updatePendixCliente(id: string, p: Partial<Omit<PendixCliente, 'id' | 'created_at'>>) {
  const { data, error } = await supabase
    .from('pendix_clientes')
    .update({ ...p, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data as PendixCliente;
}

export async function deletePendixCliente(id: string) {
  const { error } = await supabase.from('pendix_clientes').delete().eq('id', id);
  if (error) throw error;
}

// ── Pendências ──────────────────────────────────────────────────────────────

const PENDENCIA_SELECT = '*, pendix_clientes(id, nome, responsavel, telefone, consentimento_whatsapp), pendix_documentos_config(descricao_whatsapp, arquivo_modelo_url, arquivo_modelo_nome, prioridade)';

export async function getPendixPendencias(filters?: {
  clienteId?: string; status?: string; competencia?: string; search?: string;
}) {
  let q = supabase.from('pendix_pendencias').select(PENDENCIA_SELECT).order('data_limite', { ascending: true });

  if (!isSuperAdmin()) {
    const eid = sessionOfficeId();
    if (eid) q = q.eq('escritorio_id', eid);
  }
  if (filters?.clienteId) q = q.eq('cliente_id', filters.clienteId);
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.competencia) q = q.eq('competencia', filters.competencia);

  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as PendixPendencia[];
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    rows = rows.filter((r) =>
      r.nome_documento.toLowerCase().includes(s) ||
      (r.pendix_clientes?.nome ?? '').toLowerCase().includes(s));
  }
  return rows;
}

export async function getPendixPendencia(id: string) {
  const { data, error } = await supabase.from('pendix_pendencias').select(PENDENCIA_SELECT).eq('id', id).single();
  if (error) throw error;
  return data as PendixPendencia;
}

export async function postPendixPendencia(
  p: Omit<PendixPendencia, 'id' | 'created_at' | 'updated_at' | 'pendix_clientes' | 'pendix_documentos_config'>
) {
  const eid = sessionOfficeId();
  const { data, error } = await supabase
    .from('pendix_pendencias')
    .insert({ ...p, escritorio_id: p.escritorio_id || eid })
    .select().single();
  if (error) throw error;
  const pendencia = data as PendixPendencia;
  void notificarAgenteNovaPendencia(pendencia);
  return pendencia;
}

export async function updatePendixPendenciaStatus(id: string, status: PendixPendenciaStatus, obs?: string) {
  const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'recebido') payload.data_recebimento = new Date().toISOString();
  if (obs !== undefined) payload.observacoes = obs;
  const { data, error } = await supabase.from('pendix_pendencias')
    .update(payload).eq('id', id).select(PENDENCIA_SELECT).single();
  if (error) throw error;
  const atualizada = data as PendixPendencia;

  // Fechou o ciclo de uma recorrente → abre o próximo. Best-effort: se falhar,
  // o documento continua marcado como recebido (o que o usuário pediu) e a
  // próxima ocorrência pode ser gerada de novo no próximo "recebido" ou à mão.
  if (status === 'recebido') {
    try {
      await gerarProximaOcorrencia(atualizada);
    } catch (err) {
      console.warn('[Pendências] Falha ao gerar a próxima ocorrência:', err);
    }
  }

  return atualizada;
}

/**
 * Liga/desliga a cobrança automática de uma pendência.
 *
 * Religar NÃO zera `cobrancas_enviadas` de propósito: o teto de reenvios é do
 * escritório, e um liga-desliga não pode ser um jeito de furá-lo. Se o teto já
 * foi batido, a tela avisa em vez de prometer uma cobrança que não sai.
 */
export async function setCobrancaAutomatica(id: string, ligada: boolean): Promise<PendixPendencia> {
  const { data, error } = await supabase
    .from('pendix_pendencias')
    .update({ cobranca_automatica: ligada, updated_at: new Date().toISOString() })
    .eq('id', id).select(PENDENCIA_SELECT).single();
  if (error) throw error;
  return data as PendixPendencia;
}

/**
 * Cria a ocorrência seguinte de uma pendência recorrente, copiando o que
 * define o "molde" (cliente, documento, prioridade, anexo de exemplo) e
 * avançando as datas conforme a periodicidade.
 *
 * Devolve `null` quando não há o que gerar: pendência única, ou uma sucessora
 * que já existe. O índice único em `recorrencia_pai_id` é quem realmente
 * garante isso — a checagem antes é só para evitar o round-trip inútil, e a
 * violação (23505) é tratada como "outro já gerou", não como erro.
 */
export async function gerarProximaOcorrencia(p: PendixPendencia): Promise<PendixPendencia | null> {
  if (!ehRecorrente(p.periodicidade)) return null;

  const proxima = calcularProximaOcorrencia(p);
  if (!proxima) return null;

  const { data: existente, error: errExistente } = await supabase
    .from('pendix_pendencias').select('id').eq('recorrencia_pai_id', p.id).maybeSingle();
  if (errExistente) throw errExistente;
  if (existente) return null;

  const { data, error } = await supabase.from('pendix_pendencias').insert({
    escritorio_id: p.escritorio_id,
    cliente_id: p.cliente_id,
    documento_id: p.documento_id ?? null,
    nome_documento: p.nome_documento,
    competencia: proxima.competencia,
    status: 'pendente',
    tipo: p.tipo ?? 'cliente',
    descricao: p.descricao ?? null,
    prioridade: p.prioridade ?? 'media',
    data_limite: proxima.data_limite ?? null,
    data_inicio_cobranca: proxima.data_inicio_cobranca ?? null,
    horario_notificacao: p.horario_notificacao ?? '09:00',
    datas_notificacao: proxima.datas_notificacao,
    // `datas_notificacao_enviadas` fica vazia de propósito: o ciclo novo ainda
    // não teve lembrete nenhum enviado.
    arquivo_modelo_url: p.arquivo_modelo_url ?? null,
    arquivo_modelo_nome: p.arquivo_modelo_nome ?? null,
    origem: p.origem ?? 'manual',
    periodicidade: p.periodicidade,
    recorrencia_pai_id: p.id,
    // O ciclo novo herda a configuração de cobrança, mas com o contador
    // zerado: o teto de reenvios é por ocorrência, não por recorrência.
    cobranca_automatica: p.cobranca_automatica ?? true,
    cobranca_frequencia: p.cobranca_frequencia ?? FREQUENCIA_COBRANCA_PADRAO,
    cobrancas_enviadas: 0,
    // Nunca nulo aqui: o cron lê nulo como "cobrar agora", e o cliente levaria
    // hoje a cobrança do documento do mês que vem.
    proxima_cobranca_em: inicioDaCobranca(proxima),
  }).select().single();

  if (error) {
    if ((error as { code?: string }).code === '23505') return null; // outro cliente já gerou
    throw error;
  }

  const nova = data as PendixPendencia;
  void notificarAgenteNovaPendencia(nova);
  return nova;
}

export async function deletePendixPendencia(id: string) {
  const { error } = await supabase.from('pendix_pendencias').delete().eq('id', id);
  if (error) throw error;
}

// ── Anexos (Supabase Storage) ───────────────────────────────────────────────

export const BUCKET_ANEXOS = 'pendix-anexos';

/**
 * `arquivo_url` guarda o PATH dentro do bucket, não uma URL — no formato
 * `{escritorio_id}/{cliente_id}/{timestamp}-{nome}`. O bucket é privado, então
 * o download exige URL assinada; a policy de SELECT do storage confere se a
 * primeira pasta do path é o escritório do usuário.
 */
export async function getUrlAssinadaAnexo(path: string, expiraEmSegundos = 300): Promise<string> {
  const limpo = path.replace(/^\/+/, '');
  const { data, error } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .createSignedUrl(limpo, expiraEmSegundos);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Storage não devolveu URL assinada.');
  return data.signedUrl;
}

// ── Histórico ──────────────────────────────────────────────────────────────

export async function getPendixHistorico(opts?: { clienteId?: string; pendenciaId?: string }) {
  let q = supabase.from('pendix_historico').select('*, pendix_clientes(id, nome)').order('created_at', { ascending: false }).limit(300);
  if (!isSuperAdmin()) {
    const eid = sessionOfficeId();
    if (eid) q = q.eq('escritorio_id', eid);
  }
  if (opts?.clienteId) q = q.eq('cliente_id', opts.clienteId);
  if (opts?.pendenciaId) q = q.eq('pendencia_id', opts.pendenciaId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PendixHistoricoEntry[];
}

// ── Conversa do agente (WhatsApp) ────────────────────────────────────────────

export async function getPendixConversaMensagens(pendenciaId: string) {
  const { data: conversas, error: errConversa } = await supabase
    .from('pendix_conversas').select('*').eq('pendencia_id', pendenciaId).order('criada_em', { ascending: true });
  if (errConversa) throw errConversa;
  if (!conversas?.length) return { conversas: [] as PendixConversa[], mensagens: [] as PendixMensagem[] };

  const conversaIds = conversas.map((c) => c.id);
  const { data: mensagens, error: errMsg } = await supabase
    .from('pendix_mensagens').select('*').in('conversa_id', conversaIds).order('criada_em', { ascending: true });
  if (errMsg) throw errMsg;

  return { conversas: conversas as PendixConversa[], mensagens: (mensagens ?? []) as PendixMensagem[] };
}

// ── Agente de IA (Claude + Z-API) ────────────────────────────────────────────
// Dispara o primeiro contato automático assim que uma pendência é criada.
// Espelha notificarAgenteNovaPendencia do site — best-effort, nunca bloqueia a
// criação da pendência (o cron diário eventualmente pega se isso falhar).

async function notificarAgenteNovaPendencia(pendencia: PendixPendencia) {
  if (pendencia.status !== 'pendente') return;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${apiUrl}/api/pendix/agente/pendencia-criada`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ pendencia_id: pendencia.id }),
    });
  } catch {
    // silencioso — mesmo comportamento do site
  }
}

// ── Configuração de cobrança do agente (por escritório) ──────────────────────

export interface PendixConfiguracaoCobranca {
  escritorio_id: string;
  dias_amigavel: number;
  dias_lembrete: number;
  dias_urgente: number;
  horario_inicio: string;
  horario_fim: string;
  max_reenvios: number;
  cooldown_horas: number;
  ativo: boolean;
}

// Uma lista só destes números, em lib/cobranca.ts — o cron usa a mesma.
const CONFIG_COBRANCA_DEFAULT: Omit<PendixConfiguracaoCobranca, 'escritorio_id'> = REGRAS_COBRANCA_PADRAO;

export async function getPendixConfiguracaoCobranca(): Promise<PendixConfiguracaoCobranca> {
  const eid = sessionOfficeId() ?? '';
  const { data, error } = await supabase
    .from('pendix_configuracao_cobranca').select('*')
    .eq('escritorio_id', eid).maybeSingle();
  if (error) throw error;
  return data ? (data as PendixConfiguracaoCobranca) : { escritorio_id: eid, ...CONFIG_COBRANCA_DEFAULT };
}

export async function salvarPendixConfiguracaoCobranca(config: Omit<PendixConfiguracaoCobranca, 'escritorio_id'>) {
  const eid = sessionOfficeId() ?? '';
  const { data, error } = await supabase
    .from('pendix_configuracao_cobranca')
    .upsert({ escritorio_id: eid, ...config }, { onConflict: 'escritorio_id' })
    .select().single();
  if (error) throw error;
  return data as PendixConfiguracaoCobranca;
}

// ── Notificações (derivadas de pendências + histórico, não persistidas) ─────

export type PendixNotificacaoTipo = 'vencida' | 'proxima_vencimento' | 'cliente_respondeu' | 'documento_recebido';

export interface PendixNotificacaoDerivada {
  id: string;
  tipo: PendixNotificacaoTipo;
  titulo: string;
  descricao: string;
  data: string;
  pendencia_id?: string;
  cliente_id?: string;
  cliente_nome?: string;
}

// Não existe uma tabela de "notificações lidas/não lidas" — esta lista é
// calculada na hora a partir de pendências e histórico reais (sem estado de
// leitura persistido; "lida" vive só na sessão do app).
export async function getPendixNotificacoesDerivadas(): Promise<PendixNotificacaoDerivada[]> {
  const hoje = new Date().toISOString().slice(0, 10);
  const emTresDias = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const quatorzeDiasAtras = new Date(Date.now() - 14 * 86400000).toISOString();

  const [pendenciasRes, historicoRes] = await Promise.all([
    getPendixPendencias({ status: 'pendente' }),
    getPendixHistorico(),
  ]);

  const notifs: PendixNotificacaoDerivada[] = [];

  for (const p of pendenciasRes) {
    if (!p.data_limite) continue;
    const nome = p.pendix_clientes?.nome ?? 'Cliente';
    if (p.data_limite < hoje) {
      notifs.push({
        id: `vencida-${p.id}`, tipo: 'vencida',
        titulo: `${p.nome_documento} vencida`,
        descricao: `${nome} ainda não enviou — venceu em ${new Date(p.data_limite + 'T00:00:00').toLocaleDateString('pt-BR')}.`,
        data: p.data_limite, pendencia_id: p.id,
      });
    } else if (p.data_limite <= emTresDias) {
      notifs.push({
        id: `vencimento-${p.id}`, tipo: 'proxima_vencimento',
        titulo: `${p.nome_documento} vence em breve`,
        descricao: `${nome} — prazo em ${new Date(p.data_limite + 'T00:00:00').toLocaleDateString('pt-BR')}.`,
        data: p.data_limite, pendencia_id: p.id,
      });
    }
  }

  for (const h of historicoRes) {
    if (h.created_at < quatorzeDiasAtras) continue;
    if (h.acao === 'documento_aprovado') {
      notifs.push({
        id: `recebido-${h.id}`, tipo: 'documento_recebido',
        titulo: 'Documento recebido e validado',
        descricao: h.descricao ?? '', data: h.created_at, pendencia_id: h.pendencia_id,
        cliente_id: h.cliente_id, cliente_nome: h.pendix_clientes?.nome,
      });
    } else if (h.acao === 'resposta_enviada' || h.acao === 'documento_reprovado' || h.acao === 'documento_parcial') {
      notifs.push({
        id: `resposta-${h.id}`, tipo: 'cliente_respondeu',
        titulo: 'Cliente interagiu com o agente',
        descricao: h.descricao ?? '', data: h.created_at, pendencia_id: h.pendencia_id,
        cliente_id: h.cliente_id, cliente_nome: h.pendix_clientes?.nome,
      });
    }
  }

  return notifs.sort((a, b) => b.data.localeCompare(a.data));
}

// ── Stats do Dashboard ───────────────────────────────────────────────────────

export async function getPendixStats() {
  const eid = sessionOfficeId();
  const isAdmin = isSuperAdmin();
  const applyFilter = (q: any) => (!isAdmin && eid ? q.eq('escritorio_id', eid) : q);
  const today = new Date().toISOString().slice(0, 10);

  const [clientes, abertas, vencidas, hoje, concluidas] = await Promise.all([
    applyFilter(supabase.from('pendix_clientes').select('id', { count: 'exact', head: true }).eq('status', 'ativo')),
    applyFilter(supabase.from('pendix_pendencias').select('id', { count: 'exact', head: true }).in('status', ['pendente', 'em_analise'])),
    applyFilter(supabase.from('pendix_pendencias').select('id', { count: 'exact', head: true }).eq('status', 'pendente').lt('data_limite', today)),
    applyFilter(supabase.from('pendix_pendencias').select('id', { count: 'exact', head: true }).eq('status', 'recebido').gte('data_recebimento', today + 'T00:00:00Z')),
    applyFilter(supabase.from('pendix_pendencias').select('id', { count: 'exact', head: true }).eq('status', 'recebido')),
  ]);

  return {
    clientesAtivos: clientes.count ?? 0,
    pendenciasAbertas: abertas.count ?? 0,
    vencidas: vencidas.count ?? 0,
    recebidosHoje: hoje.count ?? 0,
    pendenciasConcluidas: concluidas.count ?? 0,
  };
}

export async function getPendixPendenciasPorStatusEMes() {
  const eid = sessionOfficeId();
  const isAdmin = isSuperAdmin();
  let q = supabase.from('pendix_pendencias').select('id, status, competencia, data_limite, created_at, prioridade');
  if (!isAdmin && eid) q = q.eq('escritorio_id', eid);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as { id: string; status: PendixPendenciaStatus; competencia: string; data_limite?: string; created_at: string; prioridade?: PendixPrioridade }[];
}
