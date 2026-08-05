import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Search, ChevronRight, SlidersHorizontal, X } from 'lucide-react-native';
import { getPendixPendencias, getPendixClientes, type PendixPendencia, type PendixPendenciaStatus, type PendixCliente, type PendixPrioridade } from '@/services/pendix';
import { getEmpresas, getVinculosEmpresa, type Empresa } from '@/services/empresasLocal';
import { getPendenciasExtraMap, type PendenciaExtra } from '@/services/pendenciasExtra';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Loader } from '@/components/Loader';
import { BottomSheetModal } from '@/components/Modal';
import { Select } from '@/components/Select';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';

const STATUS_FILTROS: { label: string; value: PendixPendenciaStatus | undefined }[] = [
  { label: 'Todas', value: undefined },
  { label: 'Pendente', value: 'pendente' },
  { label: 'Em análise', value: 'em_analise' },
  { label: 'Recebido', value: 'recebido' },
];

const STATUS_STYLE: Record<PendixPendenciaStatus, { tone: 'yellow' | 'blue' | 'green' | 'red' | 'gray'; label: string }> = {
  pendente: { tone: 'yellow', label: 'Pendente' },
  em_analise: { tone: 'blue', label: 'Em análise' },
  recebido: { tone: 'green', label: 'Recebido' },
  rejeitado: { tone: 'red', label: 'Rejeitado' },
  cancelado: { tone: 'gray', label: 'Cancelado' },
};

const PRIORIDADE_OPTS: { value: PendixPrioridade | 'todas'; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
}

export default function PendenciasListScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PendixPendencia[]>([]);
  const [clientes, setClientes] = useState<PendixCliente[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [vinculos, setVinculos] = useState<Record<string, string>>({});
  const [extraMap, setExtraMap] = useState<Record<string, PendenciaExtra>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<PendixPendenciaStatus | undefined>(undefined);
  const [search, setSearch] = useState('');

  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [prioridadeFiltro, setPrioridadeFiltro] = useState<PendixPrioridade | 'todas'>('todas');
  const [clienteFiltro, setClienteFiltro] = useState<string | null>(null);
  const [empresaFiltro, setEmpresaFiltro] = useState<string | null>(null);
  const [vencimentoAte, setVencimentoAte] = useState('');

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [rows, cli, emp, vinc, extra] = await Promise.all([
        getPendixPendencias({ status, search: search || undefined }),
        getPendixClientes(),
        getEmpresas(),
        getVinculosEmpresa(),
        getPendenciasExtraMap(),
      ]);
      setItems(rows);
      setClientes(cli);
      setEmpresas(emp);
      setVinculos(vinc);
      setExtraMap(extra);
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

  const filtrosAtivos = prioridadeFiltro !== 'todas' || !!clienteFiltro || !!empresaFiltro || !!vencimentoAte;

  function limparFiltros() {
    setPrioridadeFiltro('todas');
    setClienteFiltro(null);
    setEmpresaFiltro(null);
    setVencimentoAte('');
  }

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (prioridadeFiltro !== 'todas' && (extraMap[p.id]?.prioridade ?? 'media') !== prioridadeFiltro) return false;
      if (clienteFiltro && p.cliente_id !== clienteFiltro) return false;
      if (empresaFiltro && vinculos[p.cliente_id] !== empresaFiltro) return false;
      if (vencimentoAte && (!p.data_limite || p.data_limite > vencimentoAte)) return false;
      return true;
    });
  }, [items, extraMap, vinculos, prioridadeFiltro, clienteFiltro, empresaFiltro, vencimentoAte]);

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

      <View className="flex-row items-center gap-2 px-5 mb-3">
        <View className="flex-1 flex-row items-center bg-white/[0.04] border border-white/10 rounded-xl px-3">
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
        <Pressable
          onPress={() => setFiltrosOpen(true)}
          className={`w-10 h-10 rounded-xl items-center justify-center border ${filtrosAtivos ? 'bg-purple-600 border-purple-600' : 'bg-white/[0.04] border-white/10'}`}
        >
          <SlidersHorizontal size={16} color={filtrosAtivos ? '#fff' : '#9ca3af'} />
        </Pressable>
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
        <Loader />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />}
          ListEmptyComponent={<EmptyState icon={Search} title="Nenhuma pendência encontrada." />}
          renderItem={({ item }) => {
            const s = STATUS_STYLE[item.status];
            const prio = extraMap[item.id]?.prioridade;
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
                    <Badge label={s.label} tone={s.tone} />
                    {!!prio && <Badge label={PRIORIDADE_OPTS.find((p) => p.value === prio)?.label ?? prio} tone={prio === 'urgente' || prio === 'alta' ? 'red' : 'gray'} />}
                    <Text className="text-gray-600 text-[11px]">Prazo {formatDate(item.data_limite)}</Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#4b5563" />
              </Pressable>
            );
          }}
        />
      )}

      <BottomSheetModal visible={filtrosOpen} onClose={() => setFiltrosOpen(false)} title="Filtros">
        <Select label="Prioridade" value={prioridadeFiltro} onChange={setPrioridadeFiltro} options={PRIORIDADE_OPTS} />

        <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Cliente</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          <Pressable onPress={() => setClienteFiltro(null)} className={`px-3 py-2 rounded-lg border ${!clienteFiltro ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}>
            <Text className={`text-xs font-semibold ${!clienteFiltro ? 'text-white' : 'text-gray-500'}`}>Todos</Text>
          </Pressable>
          {clientes.map((c) => (
            <Pressable key={c.id} onPress={() => setClienteFiltro(c.id)} className={`px-3 py-2 rounded-lg border ${clienteFiltro === c.id ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}>
              <Text className={`text-xs font-semibold ${clienteFiltro === c.id ? 'text-white' : 'text-gray-500'}`} numberOfLines={1}>{c.nome}</Text>
            </Pressable>
          ))}
        </View>

        <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Empresa</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          <Pressable onPress={() => setEmpresaFiltro(null)} className={`px-3 py-2 rounded-lg border ${!empresaFiltro ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}>
            <Text className={`text-xs font-semibold ${!empresaFiltro ? 'text-white' : 'text-gray-500'}`}>Todas</Text>
          </Pressable>
          {empresas.map((e) => (
            <Pressable key={e.id} onPress={() => setEmpresaFiltro(e.id)} className={`px-3 py-2 rounded-lg border ${empresaFiltro === e.id ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}>
              <Text className={`text-xs font-semibold ${empresaFiltro === e.id ? 'text-white' : 'text-gray-500'}`} numberOfLines={1}>{e.nome}</Text>
            </Pressable>
          ))}
        </View>

        <Input label="Vencimento até (AAAA-MM-DD)" value={vencimentoAte} onChangeText={setVencimentoAte} placeholder="2026-08-31" />

        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button label="Limpar" variant="outline" icon={X} onPress={limparFiltros} />
          </View>
          <View className="flex-1">
            <Button label="Aplicar" onPress={() => setFiltrosOpen(false)} />
          </View>
        </View>
      </BottomSheetModal>
    </View>
  );
}
