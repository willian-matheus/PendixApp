import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Search, ChevronRight } from 'lucide-react-native';
import { getPendixPendencias, type PendixPendencia, type PendixPendenciaStatus } from '@/services/pendix';

const STATUS_FILTROS: { label: string; value: PendixPendenciaStatus | undefined }[] = [
  { label: 'Todas', value: undefined },
  { label: 'Pendente', value: 'pendente' },
  { label: 'Em análise', value: 'em_analise' },
  { label: 'Recebido', value: 'recebido' },
];

const STATUS_STYLE: Record<PendixPendenciaStatus, { bg: string; fg: string; label: string }> = {
  pendente: { bg: 'rgba(251,191,36,0.15)', fg: '#fbbf24', label: 'Pendente' },
  em_analise: { bg: 'rgba(96,165,250,0.15)', fg: '#60a5fa', label: 'Em análise' },
  recebido: { bg: 'rgba(74,222,128,0.15)', fg: '#4ade80', label: 'Recebido' },
  rejeitado: { bg: 'rgba(248,113,113,0.15)', fg: '#f87171', label: 'Rejeitado' },
  cancelado: { bg: 'rgba(156,163,175,0.15)', fg: '#9ca3af', label: 'Cancelado' },
};

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
}

export default function PendenciasListScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PendixPendencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<PendixPendenciaStatus | undefined>(undefined);
  const [search, setSearch] = useState('');

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const rows = await getPendixPendencias({ status, search: search || undefined });
      setItems(rows);
    } catch (err) {
      console.error('[Pendências] Falha ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useFocusEffect(
    useCallback(() => {
      load({ silent: true });
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="flex-row items-center justify-between px-5 mb-4">
        <Text className="text-xl font-bold text-white">Pendências</Text>
        <Pressable
          onPress={() => router.push('/(app)/pendencias/nova')}
          className="w-9 h-9 rounded-full bg-purple-600 items-center justify-center"
        >
          <Plus size={18} color="#fff" />
        </Pressable>
      </View>

      <View className="px-5 mb-3">
        <View className="flex-row items-center bg-white/[0.04] border border-white/10 rounded-xl px-3">
          <Search size={14} color="#6b7280" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => load()}
            placeholder="Buscar por documento ou cliente..."
            placeholderTextColor="#4b5563"
            className="flex-1 text-white text-sm py-2.5 px-2.5"
          />
        </View>
      </View>

      <View className="flex-row gap-2 px-5 mb-4">
        {STATUS_FILTROS.map((f) => {
          const active = f.value === status;
          return (
            <Pressable
              key={f.label}
              onPress={() => setStatus(f.value)}
              className={`px-3 py-1.5 rounded-full border ${active ? 'bg-purple-600 border-purple-600' : 'bg-white/[0.03] border-white/10'}`}
            >
              <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-500'}`}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color="#a78bfa" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />}
          ListEmptyComponent={
            <Text className="text-gray-600 text-sm text-center mt-10">Nenhuma pendência encontrada.</Text>
          }
          renderItem={({ item }) => {
            const s = STATUS_STYLE[item.status];
            return (
              <Pressable
                onPress={() => router.push(`/(app)/pendencias/${item.id}`)}
                className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex-row items-center justify-between"
              >
                <View className="flex-1 pr-2">
                  <Text className="text-white font-semibold text-sm" numberOfLines={1}>{item.nome_documento}</Text>
                  <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>
                    {item.pendix_clientes?.nome ?? 'Cliente'} · {item.competencia}
                  </Text>
                  <View className="flex-row items-center gap-2 mt-2">
                    <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
                      <Text style={{ color: s.fg, fontSize: 10, fontWeight: '700' }}>{s.label}</Text>
                    </View>
                    <Text className="text-gray-600 text-[11px]">Prazo {formatDate(item.data_limite)}</Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#4b5563" />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
