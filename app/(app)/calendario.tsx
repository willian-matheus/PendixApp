import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal, FlatList } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Users, X } from 'lucide-react-native';
import { getPendixPendencias, type PendixPendencia, type PendixPrioridade } from '@/services/pendix';

const PRIOR_DOT: Record<PendixPrioridade, string> = {
  baixa: '#9ca3af', media: '#facc15', alta: '#fb923c', urgente: '#f87171',
};
const PRIOR_LABEL: Record<PendixPrioridade, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarioScreen() {
  const router = useRouter();
  const [pendencias, setPendencias] = useState<PendixPendencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    getPendixPendencias().then(setPendencias).catch((err) => console.error('[Calendário] Falha:', err)).finally(() => setLoading(false));
  }, []));

  const byDay = useMemo(() => {
    const map = new Map<string, PendixPendencia[]>();
    for (const p of pendencias) {
      if (!p.data_limite) continue;
      const key = p.data_limite.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [pendencias]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toKey(new Date());

  const cells: { key: string; day: number | null }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ key: `empty-${i}`, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d });
  }

  const selectedList = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="px-5 mb-4">
        <Text className="text-xl font-bold text-white">Calendário</Text>
        <Text className="text-gray-500 text-xs mt-1">
          {loading ? 'Carregando…' : `${pendencias.filter((p) => p.data_limite).length} pendência(s) com vencimento`}
        </Text>
      </View>

      <View className="flex-row items-center justify-between px-5 mb-4">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-xl border border-white/10">
            <ChevronLeft size={16} color="#9ca3af" />
          </Pressable>
          <Text className="text-white font-black text-sm w-32 text-center">{MESES[month]} {year}</Text>
          <Pressable onPress={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-xl border border-white/10">
            <ChevronRight size={16} color="#9ca3af" />
          </Pressable>
        </View>
        <Pressable onPress={() => { const d = new Date(); d.setDate(1); setCursor(d); }} className="px-3 py-2 rounded-xl border border-white/10">
          <Text className="text-gray-400 text-xs font-bold">Hoje</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#a78bfa" style={{ marginTop: 40 }} />
      ) : (
        <View className="mx-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
          <View className="flex-row border-b border-white/[0.06]">
            {DIAS_SEMANA.map((d, i) => (
              <View key={i} style={{ width: `${100 / 7}%` }} className="py-2 items-center">
                <Text className="text-gray-600 text-[10px] font-black uppercase">{d}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {cells.map((cell) => {
              if (cell.day === null) {
                return <View key={cell.key} style={{ width: `${100 / 7}%`, height: 52 }} className="border-b border-r border-white/[0.03]" />;
              }
              const items = byDay.get(cell.key) ?? [];
              const isToday = cell.key === todayKey;
              return (
                <Pressable
                  key={cell.key}
                  onPress={() => items.length > 0 && setSelectedDay(cell.key)}
                  style={{ width: `${100 / 7}%`, height: 52 }}
                  className="border-b border-r border-white/[0.03] items-center justify-center"
                >
                  <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? '#9333ea' : 'transparent' }}>
                    <Text style={{ color: isToday ? '#fff' : '#9ca3af', fontSize: 12, fontWeight: '700' }}>{cell.day}</Text>
                  </View>
                  {items.length > 0 && (
                    <View className="flex-row gap-0.5 mt-1">
                      {items.slice(0, 3).map((p) => (
                        <View key={p.id} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: PRIOR_DOT[p.pendix_documentos_config?.prioridade as PendixPrioridade || 'media'] }} />
                      ))}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <Modal visible={!!selectedDay} animationType="slide" transparent onRequestClose={() => setSelectedDay(null)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-[#0e0e1a] border-t border-white/10 rounded-t-3xl max-h-[70%]">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <Text className="text-white font-black text-base">
                {selectedDay ? new Date(selectedDay + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
              </Text>
              <Pressable onPress={() => setSelectedDay(null)}><X size={18} color="#9ca3af" /></Pressable>
            </View>
            <FlatList
              data={selectedList}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, gap: 8 }}
              renderItem={({ item }) => {
                const prior = (item.pendix_documentos_config?.prioridade as PendixPrioridade) || 'media';
                return (
                  <Pressable
                    onPress={() => { setSelectedDay(null); router.push(`/(app)/pendencias/${item.id}`); }}
                    className="flex-row items-center gap-3 p-3 rounded-xl border border-white/[0.06]"
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PRIOR_DOT[prior] }} />
                    <View className="flex-1">
                      <Text className="text-white text-sm font-semibold" numberOfLines={1}>{item.nome_documento}</Text>
                      <View className="flex-row items-center gap-1.5 mt-0.5">
                        <Users size={11} color="#6b7280" />
                        <Text className="text-gray-500 text-xs" numberOfLines={1}>{item.pendix_clientes?.nome ?? '—'}</Text>
                      </View>
                    </View>
                    <Text className="text-gray-500 text-[10px] font-bold uppercase">{PRIOR_LABEL[prior]}</Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
