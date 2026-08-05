import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, Calendar, History, Bell, Settings, LogOut, ChevronRight } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'US';
}

function MenuRow({ icon: Icon, label, tint, onPress }: { icon: any; label: string; tint: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-3">
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${tint}22`, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <Icon size={18} color={tint} />
      </View>
      <Text className="flex-1 text-white font-semibold text-sm">{label}</Text>
      <ChevronRight size={16} color="#4b5563" />
    </Pressable>
  );
}

export default function MaisScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  return (
    <ScrollView className="flex-1 bg-pendix-bg" contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 48 }}>
      <Text className="text-2xl font-black text-white mb-1">Mais</Text>
      <Text className="text-gray-500 text-xs mb-6">Outras áreas e configurações da conta</Text>

      <View className="flex-row items-center bg-white/[0.04] border border-white/10 rounded-2xl p-5 mb-6">
        <View className="w-14 h-14 rounded-full bg-purple-600 items-center justify-center mr-4">
          <Text className="text-white text-lg font-black">{iniciais(user?.nome || '')}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-white font-bold text-base" numberOfLines={1}>{user?.nome || 'Usuário'}</Text>
          <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>{user?.email}</Text>
        </View>
      </View>

      <MenuRow icon={Building2} label="Empresas" tint="#60a5fa" onPress={() => router.push('/(app)/empresas')} />
      <MenuRow icon={Calendar} label="Calendário" tint="#a78bfa" onPress={() => router.push('/(app)/calendario')} />
      <MenuRow icon={History} label="Histórico" tint="#60a5fa" onPress={() => router.push('/(app)/historico')} />
      <MenuRow icon={Bell} label="Alertas" tint="#facc15" onPress={() => router.push('/(app)/notificacoes')} />
      <MenuRow icon={Settings} label="Configurações" tint="#9ca3af" onPress={() => router.push('/(app)/configuracoes')} />

      <Pressable onPress={() => signOut()} className="flex-row items-center justify-center gap-2 bg-red-600/20 border border-red-500/20 rounded-xl py-3 mt-3">
        <LogOut size={14} color="#f87171" />
        <Text className="text-red-400 font-bold text-sm">Sair do Pendix</Text>
      </Pressable>
    </ScrollView>
  );
}
