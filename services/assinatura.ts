import { supabase } from '@/lib/supabase';
import { sessionOfficeId } from '@/lib/session';

// Assinatura do escritório na plataforma (Mercado Pago) — espelha
// src/pendix/services/assinatura.ts do PendixWeb.
//
// Tudo aqui é LEITURA, exceto os geradores de Pix/Boleto. As policies de
// `pendix_assinaturas` e `pendix_assinatura_pagamentos` só liberam select, de
// propósito: quem escreve é a Edge Function `mp-webhook`, com service role,
// depois de conferir com a API do Mercado Pago. Um escritório não pode se
// declarar pago.
//
// Suporte a pagamentos:
// - Pix: QR Code dinâmico + copia e cola com polling de aprovação
// - Boleto bancário: linha digitável + link oficial para PDF
// - Cartão de crédito: tokenização direta na API do Mercado Pago e
//   assinatura recorrente via Edge Function mp-assinatura (preapproval)


export type PendixAssinaturaStatus =
  | 'sem_assinatura' | 'pendente' | 'ativa' | 'inadimplente'
  | 'bloqueada' | 'pausada' | 'cancelada';

export interface PendixPlano {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  valor_centavos: number;
  frequencia: number;
  frequencia_tipo: 'days' | 'months';
  ativo: boolean;
  ordem: number;
}

export interface PendixAssinatura {
  id: string;
  escritorio_id: string;
  plano_id: string | null;
  status: PendixAssinaturaStatus;
  mp_preapproval_id: string | null;
  mp_payer_email: string | null;
  chave_ativacao: string | null;
  ultimo_pagamento_id: string | null;
  ultimo_pagamento_em: string | null;
  vencimento_em: string | null;
  bloqueada_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendixAssinaturaPagamento {
  id: string;
  mp_payment_id: string;
  valor_centavos: number;
  status: string;
  pago_em: string | null;
  payload?: {
    metodo?: 'cartao' | 'pix' | 'boleto';
    plano_codigo?: string;
    plano_nome?: string;
    qr_code?: string;
    qr_code_base64?: string;
    ticket_url?: string;
    barcode?: string;
    date_of_expiration?: string;
    simulado?: boolean;
    [key: string]: any;
  };
  created_at: string;
}

export interface PayerInfo {
  nome?: string;
  cpf?: string;
  email?: string;
}

export interface PixResult {
  payment_id: string;
  status: string;
  qr_code: string;
  qr_code_base64: string;
  ticket_url: string;
  date_of_expiration?: string;
}

export interface BoletoResult {
  payment_id: string;
  status: string;
  barcode: string;
  ticket_url: string;
  date_of_expiration?: string;
}

export function formatarValor(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function descreverCiclo(p: Pick<PendixPlano, 'frequencia' | 'frequencia_tipo'>): string {
  if (p.frequencia_tipo === 'months') {
    if (p.frequencia === 1) return 'por mês';
    if (p.frequencia === 12) return 'por ano';
    return `a cada ${p.frequencia} meses`;
  }
  return p.frequencia === 1 ? 'por dia' : `a cada ${p.frequencia} dias`;
}

/**
 * Dias até o vencimento/bloqueio.
 * Positivo = faltam X dias. 0 = vence hoje. Negativo = já venceu e o sistema
 * está BLOQUEADO. `null` = sem data definida.
 */
export function diasAteBloqueio(a: Pick<PendixAssinatura, 'vencimento_em'> | null): number | null {
  if (!a?.vencimento_em) return null;
  const [ano, mes, dia] = a.vencimento_em.split('-').map(Number);
  const limite = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((limite.getTime() - hoje.getTime()) / 86_400_000);
}

/**
 * O escritório pode usar a plataforma? Bloqueado imediatamente se não houver
 * assinatura, o status não for 'ativa', ou o vencimento já tiver passado.
 */
export function assinaturaEmDia(a: PendixAssinatura | null): boolean {
  if (!a || a.status !== 'ativa') return false;
  const dias = diasAteBloqueio(a);
  return dias === null || dias >= 0;
}

export async function getPlanos(): Promise<PendixPlano[]> {
  const { data, error } = await supabase.from('pendix_planos').select('*').order('ordem');
  if (error) throw error;
  return (data ?? []) as PendixPlano[];
}

export async function getAssinatura(): Promise<PendixAssinatura | null> {
  const eid = sessionOfficeId();
  if (!eid) return null;
  const { data, error } = await supabase
    .from('pendix_assinaturas').select('*').eq('escritorio_id', eid).maybeSingle();
  if (error) throw error;
  return (data ?? null) as PendixAssinatura | null;
}

export async function getPagamentos(limite = 20): Promise<PendixAssinaturaPagamento[]> {
  const eid = sessionOfficeId();
  if (!eid) return [];
  const { data, error } = await supabase
    .from('pendix_assinatura_pagamentos')
    .select('id, mp_payment_id, valor_centavos, status, pago_em, payload, created_at')
    .eq('escritorio_id', eid)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as PendixAssinaturaPagamento[];
}

/** Gera pagamento Pix dinâmico com QR Code e código Copia e Cola. */
export async function gerarPixPlano(codigoPlano: string, payer?: PayerInfo): Promise<PixResult> {
  const { data, error } = await supabase.functions.invoke('mp-assinatura', {
    body: { plano: codigoPlano, metodo: 'pix', payer },
  });
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro || error.message || 'Não foi possível gerar o Pix.');
  }
  if (!data?.ok) throw new Error(data?.erro || 'O Mercado Pago não confirmou a criação do Pix.');
  return data;
}

/** Gera Boleto Bancário com código de barras e link para PDF oficial. */
export async function gerarBoletoPlano(codigoPlano: string, payer: PayerInfo): Promise<BoletoResult> {
  const { data, error } = await supabase.functions.invoke('mp-assinatura', {
    body: { plano: codigoPlano, metodo: 'boleto', payer },
  });
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro || error.message || 'Não foi possível gerar o boleto.');
  }
  if (!data?.ok) throw new Error(data?.erro || 'O Mercado Pago não confirmou a criação do boleto.');
  return data;
}

export interface DadosCartao {
  numero: string;
  nomeTitular: string;
  mesExpiracao: number;
  anoExpiracao: number;
  codigoSeguranca: string;
  cpfTitular: string;
}

let cachedPublicKey: string | null = null;

/** Obtém a chave pública do Mercado Pago a partir da Edge Function mp-config */
export async function obterMercadoPagoPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;
  const { data, error } = await supabase.functions.invoke('mp-config');
  if (error || !data?.public_key) {
    throw new Error('Não foi possível obter a configuração de pagamento do Mercado Pago.');
  }
  cachedPublicKey = String(data.public_key).trim();
  return cachedPublicKey;
}

/** Tokeniza os dados do cartão diretamente na API segura do Mercado Pago */
export async function tokenizarCartao(dados: DadosCartao, publicKey: string): Promise<string> {
  const url = `https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(publicKey)}`;
  const body = {
    card_number: dados.numero.replace(/\D/g, ''),
    expiration_month: dados.mesExpiracao,
    expiration_year: dados.anoExpiracao,
    security_code: dados.codigoSeguranca.trim(),
    cardholder: {
      name: dados.nomeTitular.trim(),
      identification: {
        type: 'CPF',
        number: dados.cpfTitular.replace(/\D/g, ''),
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.id) {
    const msg = json?.cause?.[0]?.description || json?.message || 'Falha ao validar os dados do cartão de crédito.';
    throw new Error(msg);
  }

  return json.id as string;
}

/** Realiza a assinatura do plano com cartão de crédito (recorrência automática) */
export async function contratarPlanoCartao(
  codigoPlano: string,
  cardTokenId: string,
  payer?: PayerInfo,
): Promise<{ ok: boolean; status: PendixAssinaturaStatus; preapproval_id?: string }> {
  const { data, error } = await supabase.functions.invoke('mp-assinatura', {
    body: {
      plano: codigoPlano,
      metodo: 'cartao',
      card_token_id: cardTokenId,
      payer,
    },
  });

  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro || error.message || 'Não foi possível concluir a assinatura com cartão.');
  }

  if (!data?.ok) {
    throw new Error(data?.erro || 'O Mercado Pago recusou a assinatura com este cartão.');
  }

  return data;
}

/** Consulta o status atualizado do pagamento no Mercado Pago. */
export async function consultarStatusPagamento(paymentId: string): Promise<{ aprovado: boolean; status: string }> {
  const { data, error } = await supabase.functions.invoke('mp-assinatura', {
    body: { action: 'consultar_status', payment_id: paymentId },
  });
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro || error.message || 'Erro ao consultar status do pagamento.');
  }
  return { aprovado: !!data?.aprovado, status: data?.status || 'desconhecido' };
}

/** Simula aprovação de um pagamento (útil para testes e homologação) */
export async function simularPagamentoTeste(codigoPlano = 'normal', metodo: 'cartao' | 'pix' | 'boleto' = 'cartao'): Promise<void> {
  const { data, error } = await supabase.functions.invoke('mp-assinatura', {
    body: { action: 'simular_aprovacao', plano: codigoPlano, metodo },
  });
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro || error.message || 'Falha ao simular pagamento.');
  }
}


