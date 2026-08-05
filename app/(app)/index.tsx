import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Users, ClipboardList, AlertTriangle, CheckCircle2, Building2, CheckCheck,
  Bell, ArrowRight, Plus, Calendar,
} from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import {
  getPendixStats, getPendixPendenciasPorStatusEMes, getPendixHistorico, getPendixPendencias,
  type PendixPendenciaStatus, type PendixPrioridade,
} from '@/services/pendix';
import { getEmpresas } from '@/services/empresasLocal';
import { getPendenciasExtraMap } from '@/services/pendenciasExtra';
import { cfgFor, daysLabel } from '@/lib/historicoAcoes';
import { Loader } from '@/components/Loader';

type Stats = {
  clientesAtivos: number; pendenciasAbertas: number; vencidas: number;
  recebidosHoje: number; pendenciasConcluidas: number; totalEmpresas: number;
};

type Atividade = { id: string; acao: string; descricao?: string; created_at: string };
type Cobranca = { id: string; nome_documento: string; cliente: string; data_limite: string };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia,';
  if (h < 18) return 'Boa tarde,';
  return 'Boa noite,';
}

function iniciais(nome: string) {
  return nome.trim().charAt(0).toUpperCase() || 'U';
}

function StatCard({ icon: Icon, label, value, tint }: { icon: any; label: string; value: number; tint: string }) {
  return (
    <View className="flex-1 min-w-[45%] bg-white/[0.04] border border-white/10 rounded-2xl p-4" style={{ overflow: 'hidden' }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${tint}22`, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Icon size={18} color={tint} />
      </View>
      <Text className="text-3xl font-black text-white">{value}</Text>
      <Text className="text-[11px] text-gray-500 mt-0.5">{label}</Text>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: tint }} />
    </View>
  );
}

function BarRow({ label, value, max, tint }: { label: string; value: number; max: number; tint: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 6 : 0, (value / max) * 100) : 0;
  return (
    <View className="mb-3.5">
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-gray-400 text-xs">{label}</Text>
        <Text className="text-white text-xs font-bold">{value}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, width: `${pct}%`, backgroundColor: tint }} />
      </View>
    </View>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 mt-4">
      <Text className="text-white font-bold text-sm mb-4">{title}</Text>
      {children}
    </View>
  );
}

const STATUS_LABEL: Record<PendixPendenciaStatus, string> = {
  pendente: 'Pendente', em_analise: 'Em análise', recebido: 'Recebido', rejeitado: 'Rejeitado', cancelado: 'Cancelado',
};
const STATUS_TINT: Record<PendixPendenciaStatus, string> = {
  pendente: '#fbbf24', em_analise: '#60a5fa', recebido: '#4ade80', rejeitado: '#f87171', cancelado: '#9ca3af',
};
const PRIORIDADE_LABEL: Record<PendixPrioridade, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
};
const PRIORIDADE_TINT: Record<PendixPrioridade, string> = {
  baixa: '#9ca3af', media: '#60a5fa', alta: '#fb923c', urgente: '#f87171',
};

function mesLabel(competencia: string) {
  const [ano, mes] = competencia.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const idx = Number(mes) - 1;
  return nomes[idx] ? `${nomes[idx]}/${ano.slice(2)}` : competencia;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [prioridadeCounts, setPrioridadeCounts] = useState<Record<string, number>>({});
  const [porMes, setPorMes] = useState<{ mes: string; total: number }[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statsData, empresas, pendenciasRaw, extraMap, historico, proximas] = await Promise.all([
        getPendixStats(),
        getEmpresas(),
        getPendixPendenciasPorStatusEMes(),
        getPendenciasExtraMap(),
        getPendixHistorico(),
        getPendixPendencias({ status: 'pendente' }),
      ]);

      setStats({ ...statsData, totalEmpresas: empresas.length });

      const sCounts: Record<string, number> = {};
      const pCounts: Record<string, number> = { baixa: 0, media: 0, alta: 0, urgente: 0 };
      const mesCounts = new Map<string, number>();
      for (const p of pendenciasRaw) {
        sCounts[p.status] = (sCounts[p.status] ?? 0) + 1;
        const prio = extraMap[p.id]?.prioridade ?? 'media';
        pCounts[prio] = (pCounts[prio] ?? 0) + 1;
        if (p.competencia) mesCounts.set(p.competencia, (mesCounts.get(p.competencia) ?? 0) + 1);
      }
      setStatusCounts(sCounts);
      setPrioridadeCounts(pCounts);
      setPorMes(
        [...mesCounts.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6)
          .map(([mes, total]) => ({ mes: mesLabel(mes), total }))
      );

      setAtividades(historico.slice(0, 5));

      const hoje = new Date().toISOString().slice(0, 10);
      setCobrancas(
        proximas
          .filter((p) => !!p.data_limite && p.data_limite >= hoje)
          .sort((a, b) => (a.data_limite ?? '').localeCompare(b.data_limite ?? ''))
          .slice(0, 5)
          .map((p) => ({ id: p.id, nome_documento: p.nome_documento, cliente: p.pendix_clientes?.nome ?? 'Cliente', data_limite: p.data_limite! }))
      );
    } catch (err) {
      console.error('[Dashboard] Falha ao carregar dados:', err);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const nome = user?.nome || 'Usuário';
  const abertas = stats?.pendenciasAbertas ?? 0;
  const temAlertas = (stats?.vencidas ?? 0) > 0;
  const maxStatus = Math.max(1, ...Object.values(statusCounts));
  const maxPrioridade = Math.max(1, ...Object.values(prioridadeCounts));
  const maxMes = Math.max(1, ...porMes.map((m) => m.total));

  return (
    <View className="flex-1 bg-pendix-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />}
      >
        <View className="flex-row items-center justify-end gap-3 mb-6">
          <Pressable onPress={() => router.push('/(app)/notificacoes')} className="relative w-10 h-10 items-center justify-center">
            <Bell size={22} color="#e5e7eb" />
            {temAlertas && (
              <View style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#a78bfa' }} />
            )}
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/mais')} className="relative">
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
              <Text className="text-white font-black text-base">{iniciais(nome)}</Text>
            </View>
            <View style={{ position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#06000f' }} />
          </Pressable>
        </View>

        <View className="mb-8">
          <Text className="text-xs text-gray-500 tracking-wide">{greeting()}</Text>
          <Text className="text-3xl font-black text-white mt-1">{nome}</Text>
          <Text className="text-xs text-gray-500 mt-2">Aqui está o resumo de hoje.</Text>
        </View>

        {loading ? (
          <Loader />
        ) : (
          <>
            <View className="flex-row flex-wrap gap-3">
              <StatCard icon={Users} label="Clientes ativos" value={stats?.clientesAtivos ?? 0} tint="#a78bfa" />
              <StatCard icon={Building2} label="Total de empresas" value={stats?.totalEmpresas ?? 0} tint="#38bdf8" />
              <StatCard icon={ClipboardList} label="Pendências abertas" value={abertas} tint="#60a5fa" />
              <StatCard icon={AlertTriangle} label="Vencidas" value={stats?.vencidas ?? 0} tint="#f87171" />
              <StatCard icon={CheckCircle2} label="Recebidos hoje" value={stats?.recebidosHoje ?? 0} tint="#4ade80" />
              <StatCard icon={CheckCheck} label="Pendências concluídas" value={stats?.pendenciasConcluidas ?? 0} tint="#34d399" />
            </View>

            <View className="mt-6 bg-white/[0.04] border border-white/10 rounded-2xl p-5">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: 'rgba(167,139,250,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <ClipboardList size={20} color="#a78bfa" />
                  </View>
                  <Text className="text-white font-black text-xl mb-2">Pendências</Text>
                  <View className="self-start bg-purple-500/20 px-3 py-1 rounded-full mb-3">
                    <Text className="text-purple-300 text-xs font-bold">{abertas} abertas</Text>
                  </View>
                  <Text className="text-gray-500 text-xs">{abertas} pendências precisam de atenção.</Text>
                </View>

                <View style={{ width: 84, height: 84, position: 'relative' }}>
                  <View style={{ position: 'absolute', top: 12, left: 16, width: 56, height: 70, borderRadius: 10, backgroundColor: 'rgba(167,139,250,0.10)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.20)' }} />
                  <View style={{ position: 'absolute', top: 0, left: 2, width: 56, height: 70, borderRadius: 10, backgroundColor: 'rgba(167,139,250,0.16)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)', padding: 10, gap: 7 }}>
                    <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(167,139,250,0.55)', width: '70%' }} />
                    <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(167,139,250,0.55)', width: '50%' }} />
                    <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(167,139,250,0.55)', width: '60%' }} />
                  </View>
                  <View style={{ position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: 14, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0e0a17' }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>!</Text>
                  </View>
                </View>
              </View>

              <Pressable
                onPress={() => router.push('/(app)/pendencias')}
                className="mt-5 flex-row items-center justify-between border border-purple-500/30 bg-purple-500/[0.06] rounded-xl px-4 py-3"
              >
                <Text className="text-purple-300 font-bold text-sm">Ver pendências</Text>
                <ArrowRight size={16} color="#a78bfa" />
              </Pressable>
            </View>

            {/* Gráficos */}
            <ChartCard title="Pendências por status">
              {(Object.keys(STATUS_LABEL) as PendixPendenciaStatus[]).map((s) => (
                <BarRow key={s} label={STATUS_LABEL[s]} value={statusCounts[s] ?? 0} max={maxStatus} tint={STATUS_TINT[s]} />
              ))}
            </ChartCard>

            <ChartCard title="Pendências por prioridade">
              {(Object.keys(PRIORIDADE_LABEL) as PendixPrioridade[]).map((p) => (
                <BarRow key={p} label={PRIORIDADE_LABEL[p]} value={prioridadeCounts[p] ?? 0} max={maxPrioridade} tint={PRIORIDADE_TINT[p]} />
              ))}
            </ChartCard>

            <ChartCard title="Pendências por mês">
              {porMes.length === 0 ? (
                <Text className="text-gray-600 text-xs">Sem dados suficientes ainda.</Text>
              ) : (
                <View className="flex-row items-end justify-between" style={{ height: 90 }}>
                  {porMes.map((m) => (
                    <View key={m.mes} className="items-center flex-1">
                      <Text className="text-white text-[10px] font-bold mb-1">{m.total}</Text>
                      <View style={{ width: 18, height: Math.max(6, (m.total / maxMes) * 60), borderRadius: 5, backgroundColor: '#a78bfa' }} />
                      <Text className="text-gray-500 text-[9px] mt-2">{m.mes}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ChartCard>

            {/* Últimas atividades */}
            <View className="mt-6">
              <Text className="text-white font-bold text-sm mb-3">Últimas atividades</Text>
              {atividades.length === 0 ? (
                <Text className="text-gray-600 text-xs">Nenhuma atividade recente.</Text>
              ) : (
                <View className="gap-2">
                  {atividades.map((a) => {
                    const cfg = cfgFor(a.acao);
                    const Icon = cfg.icon;
                    return (
                      <View key={a.id} className="flex-row items-center bg-white/[0.04] border border-white/10 rounded-xl p-3.5">
                        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: cfg.bg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                          <Icon size={14} color={cfg.fg} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-white text-xs font-semibold" numberOfLines={1}>{cfg.label}</Text>
                          {!!a.descricao && <Text className="text-gray-500 text-[11px] mt-0.5" numberOfLines={1}>{a.descricao}</Text>}
                        </View>
                        <Text className="text-gray-600 text-[10px]">{daysLabel(a.created_at)}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Próximas cobranças */}
            <View className="mt-6">
              <Text className="text-white font-bold text-sm mb-3">Próximas cobranças</Text>
              {cobrancas.length === 0 ? (
                <Text className="text-gray-600 text-xs">Nenhuma cobrança agendada.</Text>
              ) : (
                <View className="gap-2">
                  {cobrancas.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => router.push(`/(app)/pendencias/${c.id}`)}
                      className="flex-row items-center bg-white/[0.04] border border-white/10 rounded-xl p-3.5"
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(167,139,250,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                        <Calendar size={14} color="#a78bfa" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-white text-xs font-semibold" numberOfLines={1}>{c.nome_documento}</Text>
                        <Text className="text-gray-500 text-[11px] mt-0.5" numberOfLines={1}>{c.cliente}</Text>
                      </View>
                      <Text className="text-purple-300 text-[11px] font-bold">
                        {new Date(c.data_limite + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/(app)/pendencias/nova')}
        style={{
          position: 'absolute', right: 20, bottom: 24,
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center',
          shadowColor: '#7c3aed', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
        }}
      >
        <Plus size={24} color="#fff" />
      </Pressable>
    </View>
  );
}
