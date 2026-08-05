import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Users, ClipboardList, AlertTriangle, CheckCircle2, Bell, ArrowRight, Plus } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { getPendixStats } from '@/services/pendix';

type Stats = { clientesAtivos: number; pendenciasAbertas: number; vencidas: number; recebidosHoje: number };

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

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getPendixStats();
      setStats(data);
    } catch (err) {
      console.error('[Dashboard] Falha ao carregar stats:', err);
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
          <ActivityIndicator color="#a78bfa" style={{ marginTop: 40 }} />
        ) : (
          <View className="flex-row flex-wrap gap-3">
            <StatCard icon={Users} label="Clientes ativos" value={stats?.clientesAtivos ?? 0} tint="#a78bfa" />
            <StatCard icon={ClipboardList} label="Pendências abertas" value={abertas} tint="#60a5fa" />
            <StatCard icon={AlertTriangle} label="Vencidas" value={stats?.vencidas ?? 0} tint="#f87171" />
            <StatCard icon={CheckCircle2} label="Recebidos hoje" value={stats?.recebidosHoje ?? 0} tint="#4ade80" />
          </View>
        )}

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
