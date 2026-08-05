import {
  Send, MessageCircle, CheckCircle2, XCircle, AlertTriangle, Eye,
  User as UserIcon, Ban, AlertCircle, FileText,
} from 'lucide-react-native';

export const ACAO_CFG: Record<string, { label: string; fg: string; bg: string; icon: any }> = {
  cobranca_enviada: { label: 'Cobrança enviada', fg: '#60a5fa', bg: 'rgba(96,165,250,0.15)', icon: Send },
  resposta_enviada: { label: 'Resposta enviada', fg: '#60a5fa', bg: 'rgba(96,165,250,0.15)', icon: MessageCircle },
  documento_aprovado: { label: 'Documento aprovado', fg: '#34d399', bg: 'rgba(52,211,153,0.15)', icon: CheckCircle2 },
  documento_reprovado: { label: 'Documento reprovado', fg: '#f87171', bg: 'rgba(248,113,113,0.15)', icon: XCircle },
  documento_parcial: { label: 'Documento parcial', fg: '#fb923c', bg: 'rgba(251,146,60,0.15)', icon: AlertTriangle },
  documento_ilegivel: { label: 'Documento ilegível', fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)', icon: AlertTriangle },
  documento_em_revisao: { label: 'Em revisão da equipe', fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)', icon: Eye },
  escalado_para_humano: { label: 'Escalado para humano', fg: '#a78bfa', bg: 'rgba(167,139,250,0.15)', icon: UserIcon },
  optout_registrado: { label: 'Cliente pediu para não contatar', fg: '#9ca3af', bg: 'rgba(156,163,175,0.15)', icon: Ban },
  limite_reenvios_atingido: { label: 'Limite de reenvios atingido', fg: '#9ca3af', bg: 'rgba(156,163,175,0.15)', icon: Ban },
  audio_sem_transcricao: { label: 'Áudio sem transcrição', fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)', icon: AlertCircle },
};
const ACAO_DEFAULT = { fg: '#c084fc', bg: 'rgba(192,132,252,0.15)', icon: FileText };

export function cfgFor(acao: string) {
  const cfg = ACAO_CFG[acao];
  return cfg ?? { ...ACAO_DEFAULT, label: acao };
}

export function daysLabel(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Ontem';
  return `${d} dias atrás`;
}
