import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal, FlatList, ScrollView } from 'react-native';
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
const DIAS_SEMANA_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type ViewMode = 'dia' | 'semana' | 'mes';

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function CalendarioScreen() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>('mes');
  const [pendencias, setPendencias] = useState<PendixPendencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => new Date());
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

  const todayKey = toKey(new Date());

  function nav(delta: number) {
    if (view === 'dia') setCursor((prev) => addDays(prev, delta));
    else if (view === 'semana') setCursor((prev) => addDays(prev, delta * 7));
    else setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }
  function goToday() { setCursor(new Date()); setSelectedDay(null); }

  function irParaPendencia(id: string) {
    router.push(`/(app)/pendencias/${id}`);
  }

  let titulo = '';
  if (view === 'mes') {
    titulo = `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  } else if (view === 'semana') {
    const ini = startOfWeek(cursor);
    const fim = addDays(ini, 6);
    titulo = ini.getMonth() === fim.getMonth()
      ? `${ini.getDate()}–${fim.getDate()} ${MESES[ini.getMonth()].slice(0, 3)}`
      : `${ini.getDate()} ${MESES[ini.getMonth()].slice(0, 3)}–${fim.getDate()} ${MESES[fim.getMonth()].slice(0, 3)}`;
  } else {
    titulo = `${DIAS_SEMANA_LONGO[cursor.getDay()]}, ${cursor.getDate()} de ${MESES[cursor.getMonth()]}`;
  }

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="px-5 mb-3">
        <Text className="text-xl font-bold text-white">Calendário</Text>
      </View>

      {/* Tabs de visão */}
      <View className="flex-row px-5 gap-2 mb-4">
        {(['dia', 'semana', 'mes'] as ViewMode[]).map((v) => (
          <Pressable
            key={v}
            onPress={() => setView(v)}
            className={`px-3.5 py-2 rounded-xl border ${view === v ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
          >
            <Text className={`text-xs font-bold uppercase ${view === v ? 'text-white' : 'text-gray-500'}`}>
              {v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="flex-row items-center justify-between px-5 mb-4">
        <View className="flex-row items-center gap-2 flex-1">
          <Pressable onPress={() => nav(-1)} className="p-2 rounded-xl border border-white/10">
            <ChevronLeft size={16} color="#9ca3af" />
          </Pressable>
          <Pressable onPress={() => nav(1)} className="p-2 rounded-xl border border-white/10">
            <ChevronRight size={16} color="#9ca3af" />
          </Pressable>
          <Text className="text-white font-black text-xs flex-1" numberOfLines={1}>{titulo}</Text>
        </View>
        <Pressable onPress={goToday} className="px-3 py-2 rounded-xl border border-white/10">
          <Text className="text-gray-400 text-xs font-bold">Hoje</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#a78bfa" style={{ marginTop: 40 }} />
      ) : view === 'mes' ? (
        <MonthGrid cursor={cursor} byDay={byDay} todayKey={todayKey} onSelectDay={setSelectedDay} />
      ) : view === 'semana' ? (
        <WeekAgenda cursor={cursor} byDay={byDay} todayKey={todayKey} onOpen={irParaPendencia} />
      ) : (
        <DayAgenda items={byDay.get(toKey(cursor)) ?? []} onOpen={irParaPendencia} />
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
              data={selectedDay ? (byDay.get(selectedDay) ?? []) : []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, gap: 8 }}
              renderItem={({ item }) => <PendenciaRow item={item} onOpen={() => { setSelectedDay(null); irParaPendencia(item.id); }} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PendenciaRow({ item, onOpen }: { item: PendixPendencia; onOpen: () => void }) {
  const prior = (item.pendix_documentos_config?.prioridade as PendixPrioridade) || 'media';
  return (
    <Pressable onPress={onOpen} className="flex-row items-center gap-3 p-3 rounded-xl border border-white/[0.06]">
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
}

// ── Visão Mês (grade) ─────────────────────────────────────────────────────
function MonthGrid({ cursor, byDay, todayKey, onSelectDay }: {
  cursor: Date; byDay: Map<string, PendixPendencia[]>; todayKey: string; onSelectDay: (k: string) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { key: string; day: number | null }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ key: `empty-${i}`, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d });
  }

  return (
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
              onPress={() => items.length > 0 && onSelectDay(cell.key)}
              style={{ width: `${100 / 7}%`, height: 52 }}
              className="border-b border-r border-white/[0.03] items-center justify-center"
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? '#9333ea' : 'transparent' }}>
                <Text style={{ color: isToday ? '#fff' : '#9ca3af', fontSize: 12, fontWeight: '700' }}>{cell.day}</Text>
              </View>
              {items.length > 0 && (
                <View className="flex-row gap-0.5 mt-1">
                  {items.slice(0, 3).map((p) => {
                    const prior = (p.pendix_documentos_config?.prioridade as PendixPrioridade) || 'media';
                    return <View key={p.id} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: PRIOR_DOT[prior] }} />;
                  })}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Visão Semana (agenda vertical) ───────────────────────────────────────
function WeekAgenda({ cursor, byDay, todayKey, onOpen }: {
  cursor: Date; byDay: Map<string, PendixPendencia[]>; todayKey: string; onOpen: (id: string) => void;
}) {
  const ini = startOfWeek(cursor);
  const dias = Array.from({ length: 7 }, (_, i) => addDays(ini, i));

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 10 }}>
      {dias.map((d) => {
        const key = toKey(d);
        const items = byDay.get(key) ?? [];
        const isToday = key === todayKey;
        return (
          <View key={key} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
            <View className="flex-row items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? '#9333ea' : 'transparent' }}>
                <Text style={{ color: isToday ? '#fff' : '#9ca3af', fontSize: 11, fontWeight: '700' }}>{d.getDate()}</Text>
              </View>
              <Text className="text-gray-400 text-xs font-bold uppercase">{DIAS_SEMANA_LONGO[d.getDay()]}</Text>
            </View>
            {items.length === 0 ? (
              <Text className="text-gray-600 text-xs px-4 py-3">Nenhuma pendência.</Text>
            ) : (
              <View className="p-2 gap-1.5">
                {items.map((p) => <PendenciaRow key={p.id} item={p} onOpen={() => onOpen(p.id)} />)}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Visão Dia (agenda simples) ───────────────────────────────────────────
function DayAgenda({ items, onOpen }: { items: PendixPendencia[]; onOpen: (id: string) => void }) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 8 }}
      ListEmptyComponent={<Text className="text-gray-600 text-sm text-center mt-10">Nenhuma pendência com vencimento neste dia.</Text>}
      renderItem={({ item }) => <PendenciaRow item={item} onOpen={() => onOpen(item.id)} />}
    />
  );
}
