import { useCallback, useMemo, useState } from 'react';
import { View, Text, SectionList, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Clock, CalendarRange, X } from 'lucide-react-native';
import { getPendixHistorico, type PendixHistoricoEntry } from '@/services/pendix';
import { cfgFor, daysLabel } from '@/lib/historicoAcoes';
import { Loader } from '@/components/Loader';
import { EmptyState } from '@/components/EmptyState';
import { BottomSheetModal } from '@/components/Modal';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';

export default function HistoricoScreen() {
  const [historico, setHistorico] = useState<PendixHistoricoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');

  useFocusEffect(useCallback(() => {
    getPendixHistorico().then(setHistorico).catch((err) => console.error('[Histórico] Falha:', err)).finally(() => setLoading(false));
  }, []));

  const tiposPresentes = useMemo(() => {
    const set = new Set(historico.map((h) => h.acao));
    return [...set];
  }, [historico]);

  const filtrado = useMemo(() => {
    return historico.filter((h) => {
      if (tipoFiltro && h.acao !== tipoFiltro) return false;
      const dia = h.created_at.slice(0, 10);
      if (dataDe && dia < dataDe) return false;
      if (dataAte && dia > dataAte) return false;
      return true;
    });
  }, [historico, tipoFiltro, dataDe, dataAte]);

  const groups: { title: string; data: PendixHistoricoEntry[] }[] = [];
  const byDate = new Map<string, PendixHistoricoEntry[]>();
  for (const e of filtrado) {
    const date = new Date(e.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(e);
  }
  byDate.forEach((data, title) => groups.push({ title, data }));

  const filtroDataAtivo = !!dataDe || !!dataAte;

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="flex-row items-center justify-between px-5 mb-1">
        <View>
          <Text className="text-xl font-bold text-white">Histórico</Text>
          <Text className="text-gray-500 text-xs mt-1">
            {loading ? 'Carregando…' : `${filtrado.length} registro${filtrado.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
        <Pressable
          onPress={() => setDataModalOpen(true)}
          className={`w-10 h-10 rounded-xl items-center justify-center border ${filtroDataAtivo ? 'bg-purple-600 border-purple-600' : 'bg-white/[0.04] border-white/10'}`}
        >
          <CalendarRange size={16} color={filtroDataAtivo ? '#fff' : '#9ca3af'} />
        </Pressable>
      </View>

      <View className="mt-3 mb-2 px-5">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setTipoFiltro(null)}
              className={`px-3.5 py-2 rounded-lg border ${!tipoFiltro ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
            >
              <Text className={`text-xs font-semibold ${!tipoFiltro ? 'text-white' : 'text-gray-500'}`}>Todos</Text>
            </Pressable>
            {tiposPresentes.map((acao) => {
              const active = tipoFiltro === acao;
              const cfg = cfgFor(acao);
              return (
                <Pressable
                  key={acao}
                  onPress={() => setTipoFiltro(acao)}
                  className={`px-3.5 py-2 rounded-lg border ${active ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
                >
                  <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-500'}`}>{cfg.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {loading ? (
        <Loader />
      ) : groups.length === 0 ? (
        <EmptyState icon={Clock} title="Nenhum registro encontrado." />
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

      <BottomSheetModal visible={dataModalOpen} onClose={() => setDataModalOpen(false)} title="Filtrar por data" maxHeight="50%">
        <Input label="De (AAAA-MM-DD)" value={dataDe} onChangeText={setDataDe} placeholder="2026-08-01" />
        <Input label="Até (AAAA-MM-DD)" value={dataAte} onChangeText={setDataAte} placeholder="2026-08-31" />
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button label="Limpar" variant="outline" icon={X} onPress={() => { setDataDe(''); setDataAte(''); }} />
          </View>
          <View className="flex-1">
            <Button label="Aplicar" onPress={() => setDataModalOpen(false)} />
          </View>
        </View>
      </BottomSheetModal>
    </View>
  );
}
