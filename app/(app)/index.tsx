import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Users, ClipboardList, AlertTriangle, CheckCircle2, LogOut } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { getPendixStats } from '@/services/pendix';

type Stats = { clientesAtivos: number; pendenciasAbertas: number; vencidas: number; recebidosHoje: number };

function StatCard({ icon: Icon, label, value, tint }: { icon: any; label: string; value: number; tint: string }) {
  return (
    <View className="flex-1 min-w-[45%] bg-white/[0.04] border border-white/10 rounded-2xl p-4">
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${tint}22`, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <Icon size={16} color={tint} />
      </View>
      <Text className="text-2xl font-black text-white">{value}</Text>
      <Text className="text-[11px] text-gray-500 mt-0.5">{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
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

  return (
    <ScrollView
      className="flex-1 bg-pendix-bg"
      contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />}
    >
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-xs text-gray-500 tracking-wide">Bem-vindo de volta,</Text>
          <Text className="text-xl font-bold text-white">{user?.nome || 'Usuário'}</Text>
        </View>
        <Pressable onPress={() => signOut()} className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 items-center justify-center">
          <LogOut size={15} color="#9ca3af" />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#a78bfa" style={{ marginTop: 40 }} />
      ) : (
        <View className="flex-row flex-wrap gap-3">
          <StatCard icon={Users} label="Clientes ativos" value={stats?.clientesAtivos ?? 0} tint="#a78bfa" />
          <StatCard icon={ClipboardList} label="Pendências abertas" value={stats?.pendenciasAbertas ?? 0} tint="#60a5fa" />
          <StatCard icon={AlertTriangle} label="Vencidas" value={stats?.vencidas ?? 0} tint="#f87171" />
          <StatCard icon={CheckCircle2} label="Recebidos hoje" value={stats?.recebidosHoje ?? 0} tint="#4ade80" />
        </View>
      )}

      <Pressable
        onPress={() => router.push('/(app)/pendencias')}
        className="mt-8 bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex-row items-center justify-between"
      >
        <Text className="text-white font-semibold text-sm">Ver todas as pendências</Text>
        <ClipboardList size={16} color="#a78bfa" />
      </Pressable>
    </ScrollView>
  );
}
