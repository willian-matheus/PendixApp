import { useCallback, useState } from 'react';
import { View, Text, SectionList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Send, MessageCircle, CheckCircle2, XCircle, AlertTriangle, Eye,
  User as UserIcon, Ban, AlertCircle, FileText, Clock,
} from 'lucide-react-native';
import { getPendixHistorico, type PendixHistoricoEntry } from '@/services/pendix';

const ACAO_CFG: Record<string, { label: string; fg: string; bg: string; icon: any }> = {
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

function cfgFor(acao: string) {
  const cfg = ACAO_CFG[acao];
  return cfg ?? { ...ACAO_DEFAULT, label: acao };
}

function daysLabel(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Ontem';
  return `${d} dias atrás`;
}

export default function HistoricoScreen() {
  const [historico, setHistorico] = useState<PendixHistoricoEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    getPendixHistorico().then(setHistorico).catch((err) => console.error('[Histórico] Falha:', err)).finally(() => setLoading(false));
  }, []));

  const groups: { title: string; data: PendixHistoricoEntry[] }[] = [];
  const byDate = new Map<string, PendixHistoricoEntry[]>();
  for (const e of historico) {
    const date = new Date(e.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(e);
  }
  byDate.forEach((data, title) => groups.push({ title, data }));

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="px-5 mb-4">
        <Text className="text-xl font-bold text-white">Histórico</Text>
        <Text className="text-gray-500 text-xs mt-1">
          {loading ? 'Carregando…' : `${historico.length} registro${historico.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#a78bfa" style={{ marginTop: 40 }} />
      ) : historico.length === 0 ? (
        <View className="items-center mt-10">
          <Clock size={24} color="#374151" />
          <Text className="text-gray-600 text-sm mt-3">Nenhum registro encontrado.</Text>
        </View>
      ) : (
        <SectionList
          sections={groups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          renderSectionHeader={({ section }) => (
            <View className="flex-row items-center gap-2 mt-5 mb-3 bg-pendix-bg">
              <View className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <Text className="text-gray-500 text-[11px] font-bold uppercase tracking-wide">{section.title}</Text>
              <View className="flex-1 h-px bg-white/[0.06]" />
              <Text className="text-gray-700 text-[10px]">{daysLabel(section.data[0].created_at)}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const cfg = cfgFor(item.acao);
            const Icon = cfg.icon;
            return (
              <View className="flex-row items-start gap-3 bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 mb-2">
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: cfg.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={15} color={cfg.fg} />
                </View>
                <View className="flex-1">
                  <View style={{ backgroundColor: cfg.bg, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                    <Text style={{ color: cfg.fg, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>{cfg.label}</Text>
                  </View>
                  {!!item.descricao && <Text className="text-white text-sm font-semibold mt-1.5 leading-snug">{item.descricao}</Text>}
                  <Text className="text-gray-700 text-[10px] mt-1.5 font-bold uppercase">
                    {item.usuario_nome ?? 'Sistema'} · {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
