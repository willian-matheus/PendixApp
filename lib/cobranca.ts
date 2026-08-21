/**
 * Cobrança automática — as regras de "cobrar quem, quando e com que tom".
 *
 * Quem precisa agir é o CLIENTE: é ele que tem o documento e é o telefone dele
 * que recebe a mensagem. O escritório não precisa apertar "Cobrar" a cada
 * ciclo — configura a frequência uma vez e o agente cobra sozinho, no ritmo
 * escolhido, até o documento chegar (`status` sair de 'pendente') ou o teto de
 * reenvios do escritório ser atingido.
 *
 * Este arquivo é a FONTE DA VERDADE das regras e é 100% puro (sem React
 * Native, sem Supabase) para poder rodar no Node — ver lib/cobranca.test.ts.
 * Quem executa é o cron: PendixWeb/supabase/functions/send-whatsapp-pendentes,
 * que carrega uma cópia destas funções (Deno não enxerga este repositório).
 * Mexeu aqui, espelhe lá — o CHECK de `cobranca_frequencia` no banco é o
 * contrato que segura as duas pontas.
 */

import {
  avancarData,
  ehData,
  somarDias,
  ehPeriodicidade,
  PERIODICIDADE_ADVERBIO,
  type PendixPeriodicidade,
} from './periodicidade.ts';

export type PendixNivelCobranca = 'amigavel' | 'lembrete' | 'urgente' | 'critico';

export const NIVEL_COBRANCA_LABEL: Record<PendixNivelCobranca, string> = {
  amigavel: 'Amigável',
  lembrete: 'Lembrete',
  urgente: 'Urgente',
  critico: 'Crítico',
};

/** Frequência padrão de quem liga a cobrança automática sem escolher nada. */
export const FREQUENCIA_COBRANCA_PADRAO: PendixPeriodicidade = 'semanal';

/** Espelha public.pendix_configuracao_cobranca (uma linha por escritório). */
export interface RegrasCobranca {
  dias_amigavel: number;
  dias_lembrete: number;
  dias_urgente: number;
  /** Janela em que é aceitável mandar mensagem, 'HH:MM'. */
  horario_inicio: string;
  horario_fim: string;
  /** Teto de mensagens automáticas por pendência. */
  max_reenvios: number;
  cooldown_horas: number;
  ativo: boolean;
}

/**
 * O que vale para um escritório que ainda não salvou nada em Configurações →
 * Cobrança. Mora aqui, e não no serviço, porque o cron precisa do MESMO padrão
 * (a cópia em send-whatsapp-pendentes/cobranca.ts o espelha) — três listas
 * soltas dos mesmos números divergiriam sem ninguém perceber.
 */
export const REGRAS_COBRANCA_PADRAO: RegrasCobranca = {
  dias_amigavel: 2, dias_lembrete: 7, dias_urgente: 15,
  horario_inicio: '08:00', horario_fim: '19:00',
  max_reenvios: 4, cooldown_horas: 24, ativo: true,
};

/** Os campos de pendix_pendencias + cliente que a decisão consulta. */
export interface PendenciaCobravel {
  status: string;
  cobranca_automatica?: boolean | null;
  cobranca_frequencia?: PendixPeriodicidade | string | null;
  proxima_cobranca_em?: string | null;
  cobrancas_enviadas?: number | null;
  horario_notificacao?: string | null;
  data_inicio_cobranca?: string | null;
  ultima_mensagem_enviada_em?: string | null;
  cliente?: { telefone?: string | null; consentimento_whatsapp?: boolean | null } | null;
}

/** "Agora" já resolvido no fuso do escritório — mantém a decisão pura. */
export interface Agora {
  /** Data local, 'YYYY-MM-DD'. */
  data: string;
  /** Minutos desde a meia-noite local. */
  minutos: number;
  /** Instante absoluto, para o cooldown. */
  iso: string;
}

export type MotivoNaoCobrar =
  | 'escritorio_desligado'
  | 'cobranca_desligada'
  | 'status_nao_pendente'
  | 'sem_telefone'
  | 'sem_consentimento'
  | 'limite_de_reenvios'
  | 'ainda_nao_e_dia'
  | 'antes_do_horario'
  | 'fora_da_janela'
  | 'em_cooldown';

export const MOTIVO_TEXTO: Record<MotivoNaoCobrar, string> = {
  escritorio_desligado: 'Cobrança automática desligada nas configurações do escritório.',
  cobranca_desligada: 'Cobrança automática desligada nesta pendência.',
  status_nao_pendente: 'A pendência não está mais pendente.',
  sem_telefone: 'O cliente não tem telefone cadastrado.',
  sem_consentimento: 'O cliente não autorizou contato por WhatsApp.',
  limite_de_reenvios: 'Teto de cobranças automáticas atingido.',
  ainda_nao_e_dia: 'A próxima cobrança é em outro dia.',
  antes_do_horario: 'Ainda não chegou o horário de notificação da pendência.',
  fora_da_janela: 'Fora da janela de horário permitida pelo escritório.',
  em_cooldown: 'Cobrança recente demais — respeitando o intervalo mínimo.',
};

export interface DecisaoCobranca {
  cobrar: boolean;
  motivo?: MotivoNaoCobrar;
  /** Tom da mensagem, quando `cobrar` for true. */
  nivel?: PendixNivelCobranca;
  /** Quantas cobranças automáticas a pendência terá após esta. */
  cobrancas_enviadas?: number;
  /** Data da cobrança seguinte, ou null quando esta foi a última. */
  proxima_cobranca_em?: string | null;
}

// ── Auxiliares de tempo ─────────────────────────────────────────────────────

/** Aceita 'HH:MM' e 'HH:MM:SS' (o Postgres devolve `time` com segundos). */
export function horarioParaMinutos(horario?: string | null): number {
  if (!horario) return 0;
  const [hh, mm] = horario.split(':').map(Number);
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

/** Dias corridos entre duas datas `YYYY-MM-DD` (b - a). */
export function diffDias(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * A janela pode atravessar a meia-noite ('22:00'–'06:00'). Não é o uso comum
 * de um escritório, mas tratar isso custa uma linha e evita uma janela vazia.
 */
export function dentroDaJanela(minutos: number, inicio: string, fim: string): boolean {
  const i = horarioParaMinutos(inicio);
  const f = horarioParaMinutos(fim);
  return i <= f ? minutos >= i && minutos <= f : minutos >= i || minutos <= f;
}

// ── Nível de cobrança ───────────────────────────────────────────────────────

/**
 * O tom sobe com o tempo em cobrança, usando os prazos que o escritório já
 * configura em Configurações → Cobrança. Com os padrões (2/7/15): dias 0–1
 * amigável, 2–6 lembrete, 7–14 urgente, 15+ crítico.
 */
export function nivelCobranca(
  diasEmCobranca: number,
  r: Pick<RegrasCobranca, 'dias_amigavel' | 'dias_lembrete' | 'dias_urgente'>,
): PendixNivelCobranca {
  if (diasEmCobranca < r.dias_amigavel) return 'amigavel';
  if (diasEmCobranca < r.dias_lembrete) return 'lembrete';
  if (diasEmCobranca < r.dias_urgente) return 'urgente';
  return 'critico';
}

// ── Decisão ─────────────────────────────────────────────────────────────────

/**
 * Decide se ESTA pendência deve ser cobrada NESTE instante, e o que gravar
 * depois do envio. O cron chama isso para cada candidata; tudo o que precisa
 * de I/O (ler o relógio, buscar o cliente) já vem resolvido nos argumentos.
 *
 * A próxima cobrança é ancorada no DIA DO ENVIO, não na data agendada: se o
 * cron ficou fora do ar por um mês, o cliente recebe uma cobrança e volta ao
 * ritmo normal, em vez de levar um mês de cobranças atrasadas de uma vez.
 */
export function decidirCobranca(
  p: PendenciaCobravel,
  r: RegrasCobranca,
  agora: Agora,
): DecisaoCobranca {
  if (!r.ativo) return { cobrar: false, motivo: 'escritorio_desligado' };
  if (p.cobranca_automatica === false) return { cobrar: false, motivo: 'cobranca_desligada' };
  if (p.status !== 'pendente') return { cobrar: false, motivo: 'status_nao_pendente' };

  const telefone = p.cliente?.telefone?.replace(/\D/g, '') ?? '';
  if (!telefone) return { cobrar: false, motivo: 'sem_telefone' };
  // `null`/`undefined` = nunca perguntado; só um "não" explícito bloqueia.
  if (p.cliente?.consentimento_whatsapp === false) return { cobrar: false, motivo: 'sem_consentimento' };

  const enviadas = p.cobrancas_enviadas ?? 0;
  if (enviadas >= r.max_reenvios) return { cobrar: false, motivo: 'limite_de_reenvios' };

  // Sem data marcada, a primeira cobrança cai no início configurado (ou hoje).
  const prevista = ehData(p.proxima_cobranca_em)
    ? p.proxima_cobranca_em!
    : (ehData(p.data_inicio_cobranca) ? p.data_inicio_cobranca! : agora.data);
  if (prevista > agora.data) return { cobrar: false, motivo: 'ainda_nao_e_dia' };

  if (agora.minutos < horarioParaMinutos(p.horario_notificacao)) {
    return { cobrar: false, motivo: 'antes_do_horario' };
  }
  if (!dentroDaJanela(agora.minutos, r.horario_inicio, r.horario_fim)) {
    return { cobrar: false, motivo: 'fora_da_janela' };
  }

  if (p.ultima_mensagem_enviada_em) {
    const horas = (Date.parse(agora.iso) - Date.parse(p.ultima_mensagem_enviada_em)) / 3_600_000;
    if (Number.isFinite(horas) && horas < r.cooldown_horas) {
      return { cobrar: false, motivo: 'em_cooldown' };
    }
  }

  const inicio = ehData(p.data_inicio_cobranca) ? p.data_inicio_cobranca! : agora.data;
  const proximas = enviadas + 1;
  const proxima = proximas >= r.max_reenvios
    ? null // esta foi a última: não adianta remarcar
    : avancarData(agora.data, p.cobranca_frequencia ?? FREQUENCIA_COBRANCA_PADRAO);

  return {
    cobrar: true,
    nivel: nivelCobranca(Math.max(0, diffDias(inicio, agora.data)), r),
    cobrancas_enviadas: proximas,
    proxima_cobranca_em: proxima,
  };
}

/**
 * Quando tentar de novo depois de uma FALHA de envio.
 *
 * A falha não conta contra o teto (a mensagem não chegou) e não mexe no
 * cooldown, que só olha envio bem-sucedido. Sem remarcar, a pendência
 * continuaria elegível e o cron tentaria de novo a cada 10 minutos, para
 * sempre — e se o provedor tiver entregue a mensagem mesmo devolvendo erro, o
 * cliente levaria uma cobrança a cada 10 minutos. Um dia de espera segura o
 * laço sem desistir da cobrança.
 */
export function reagendarAposFalha(hoje: string): string | null {
  return ehData(hoje) ? somarDias(hoje, 1) : null;
}

// ── Mensagem ────────────────────────────────────────────────────────────────

export interface DadosMensagem {
  cliente: string;
  documento: string;
  competencia: string;
  /** 'YYYY-MM-DD'. Usado só para dizer o prazo em português. */
  data_limite?: string | null;
}

function formatarBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Texto da cobrança, com o tom do nível. Sempre falando com o cliente, sempre
 * dizendo o que fazer (mandar o arquivo ali mesmo) — é ele quem precisa agir.
 */
export function montarMensagemCobranca(nivel: PendixNivelCobranca, d: DadosMensagem): string {
  const doc = `*${d.documento}* (competência ${d.competencia})`;
  const prazo = ehData(d.data_limite) ? ` O prazo é ${formatarBR(d.data_limite!)}.` : '';

  switch (nivel) {
    case 'amigavel':
      return `Olá, ${d.cliente}! Precisamos do documento ${doc}. Pode enviar por aqui mesmo, em foto ou PDF?${prazo}`;
    case 'lembrete':
      return `Olá, ${d.cliente}! Passando para lembrar que ainda estamos aguardando o documento ${doc}. Pode mandar por aqui, em foto ou PDF?${prazo}`;
    case 'urgente':
      return `${d.cliente}, o documento ${doc} está atrasado e ainda não chegou até nós.${prazo} Consegue enviar hoje, por aqui mesmo?`;
    case 'critico':
      return `${d.cliente}, este é um aviso importante: seguimos sem o documento ${doc}.${prazo} A falta dele pode gerar multa e impedir a entrega das obrigações do período. Por favor, envie por aqui o quanto antes ou fale com a gente.`;
  }
}

/**
 * Quando a cobrança de um ciclo deve começar.
 *
 * Existe para a ocorrência gerada por uma recorrência: sem isso ela nasceria
 * com `proxima_cobranca_em` nulo, o cron leria nulo como "cobrar agora" e o
 * cliente seria cobrado hoje pelo documento de setembro. Sem data de início
 * explícita, o ciclo passa a cobrar quando a competência dele começa.
 */
export function inicioDaCobranca(o: { data_inicio_cobranca?: string | null; competencia: string }): string | null {
  if (ehData(o.data_inicio_cobranca)) return o.data_inicio_cobranca!;
  return /^\d{4}-\d{2}$/.test(o.competencia) ? `${o.competencia}-01` : null;
}

// ── Texto para a UI ─────────────────────────────────────────────────────────

/** "Cobrando semanalmente · 2 de 4 enviadas · próxima em 05/09/2026". */
export function descreverCobranca(p: PendenciaCobravel, maxReenvios?: number): string {
  const jaEnviadas = p.cobrancas_enviadas ?? 0;

  // Documento entregue (ou pendência cancelada): a cobrança acabou. Dizer
  // "Cobrando semanalmente" aqui seria mentira — o cron não manda mais nada.
  if (p.status !== 'pendente') {
    if (jaEnviadas === 0) return 'Encerrada — nenhuma cobrança foi necessária';
    return `Encerrada — ${jaEnviadas} cobrança${jaEnviadas > 1 ? 's' : ''} enviada${jaEnviadas > 1 ? 's' : ''}`;
  }

  if (p.cobranca_automatica === false) return 'Cobrança automática desligada';

  const freq = ehPeriodicidade(p.cobranca_frequencia)
    ? PERIODICIDADE_ADVERBIO[p.cobranca_frequencia as PendixPeriodicidade]
    : PERIODICIDADE_ADVERBIO[FREQUENCIA_COBRANCA_PADRAO];

  const partes = [`Cobrando ${freq}`];
  if (jaEnviadas > 0) {
    partes.push(maxReenvios ? `${jaEnviadas} de ${maxReenvios} enviadas` : `${jaEnviadas} enviadas`);
  }
  if (ehData(p.proxima_cobranca_em)) {
    partes.push(`próxima em ${formatarBR(p.proxima_cobranca_em!)}`);
  }
  return partes.join(' · ');
}
