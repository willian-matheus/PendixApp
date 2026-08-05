import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, User, Calendar, FileText } from 'lucide-react-native';
import {
  getPendixPendencia, getPendixConversaMensagens, updatePendixPendenciaStatus,
  type PendixPendencia, type PendixMensagem,
} from '@/services/pendix';

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const NIVEL_LABEL: Record<string, string> = {
  amigavel: 'Amigável', lembrete: 'Lembrete', urgente: 'Urgente', critico: 'Crítico',
};

export default function PendenciaDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pendencia, setPendencia] = useState<PendixPendencia | null>(null);
  const [mensagens, setMensagens] = useState<PendixMensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, conversa] = await Promise.all([getPendixPendencia(id), getPendixConversaMensagens(id)]);
      setPendencia(p);
      setMensagens(conversa.mensagens);
    } catch (err) {
      console.error('[PendenciaDetalhe] Falha ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function marcarRecebido() {
    if (!id) return;
    setUpdating(true);
    try {
      const atualizado = await updatePendixPendenciaStatus(id, 'recebido');
      setPendencia(atualizado);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível atualizar a pendência.');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-pendix-bg items-center justify-center">
        <ActivityIndicator color="#a78bfa" />
      </View>
    );
  }

  if (!pendencia) {
    return (
      <View className="flex-1 bg-pendix-bg items-center justify-center px-6">
        <Text className="text-gray-500 text-sm text-center">Pendência não encontrada.</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-pendix-bg" contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
      <View className="flex-row items-center gap-3 mb-6">
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 items-center justify-center">
          <ArrowLeft size={16} color="#9ca3af" />
        </Pressable>
        <Text className="text-lg font-bold text-white flex-1" numberOfLines={1}>{pendencia.nome_documento}</Text>
      </View>

      <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-4">
        <View className="flex-row items-center gap-2 mb-2.5">
          <User size={14} color="#a78bfa" />
          <Text className="text-white text-sm font-semibold">{pendencia.pendix_clientes?.nome ?? 'Cliente'}</Text>
        </View>
        <View className="flex-row items-center gap-2 mb-2.5">
          <FileText size={14} color="#6b7280" />
          <Text className="text-gray-400 text-xs">Competência {pendencia.competencia}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Calendar size={14} color="#6b7280" />
          <Text className="text-gray-400 text-xs">Prazo {formatDate(pendencia.data_limite)}</Text>
        </View>
        {pendencia.nivel_cobranca_atual && (
          <View className="mt-3 self-start bg-purple-500/15 px-2.5 py-1 rounded-full">
            <Text className="text-purple-300 text-[10px] font-bold uppercase">
              {NIVEL_LABEL[pendencia.nivel_cobranca_atual] ?? pendencia.nivel_cobranca_atual}
            </Text>
          </View>
        )}
      </View>

      {pendencia.status === 'pendente' && (
        <Pressable
          onPress={marcarRecebido}
          disabled={updating}
          className="bg-purple-600 rounded-xl py-3 items-center mb-6"
          style={{ opacity: updating ? 0.6 : 1 }}
        >
          <Text className="text-white font-bold text-sm">
            {updating ? 'Atualizando...' : 'Marcar como recebido'}
          </Text>
        </Pressable>
      )}

      <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Conversa no WhatsApp</Text>
      {mensagens.length === 0 ? (
        <Text className="text-gray-600 text-sm">Nenhuma mensagem trocada ainda.</Text>
      ) : (
        <View className="gap-2.5">
          {mensagens.map((m) => (
            <View
              key={m.id}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${m.remetente === 'agente' ? 'bg-purple-600/25 self-start' : 'bg-white/[0.06] self-end'}`}
            >
              <Text className="text-white text-[13px] leading-5">{m.conteudo || (m.tipo === 'arquivo' ? '📎 Arquivo enviado' : '')}</Text>
              <Text className="text-gray-500 text-[10px] mt-1">{formatDateTime(m.criada_em)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
