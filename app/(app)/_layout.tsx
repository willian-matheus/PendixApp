import { Redirect, Tabs } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { Home, ClipboardList, Users, MoreHorizontal } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';

function TabIcon({ focused, color, Icon, label }: { focused: boolean; color: string; Icon: any; label: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 4, width: 76 }}>
      <Icon color={color} size={22} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ fontSize: 11, color, fontWeight: focused ? '700' : '500', width: 70, textAlign: 'center' }}
      >
        {label}
      </Text>
      <View style={{ height: 3, width: 18, borderRadius: 2, marginTop: 1, backgroundColor: focused ? '#a78bfa' : 'transparent' }} />
    </View>
  );
}

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 bg-pendix-bg items-center justify-center">
        <ActivityIndicator color="#a78bfa" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: '#08000f', borderTopColor: 'rgba(255,255,255,0.06)', height: 76, paddingTop: 8 },
        tabBarActiveTintColor: '#a78bfa',
        tabBarInactiveTintColor: '#4b5563',
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarIcon: ({ color, focused }) => <TabIcon Icon={Home} color={color} focused={focused} label="Início" /> }} />
      <Tabs.Screen name="pendencias" options={{ tabBarIcon: ({ color, focused }) => <TabIcon Icon={ClipboardList} color={color} focused={focused} label="Pendências" /> }} />
      <Tabs.Screen name="clientes" options={{ tabBarIcon: ({ color, focused }) => <TabIcon Icon={Users} color={color} focused={focused} label="Clientes" /> }} />
      <Tabs.Screen name="mais" options={{ tabBarIcon: ({ color, focused }) => <TabIcon Icon={MoreHorizontal} color={color} focused={focused} label="Mais" /> }} />
      <Tabs.Screen name="calendario" options={{ href: null }} />
      <Tabs.Screen name="historico" options={{ href: null }} />
      <Tabs.Screen name="notificacoes" options={{ href: null }} />
      <Tabs.Screen name="configuracoes" options={{ href: null }} />
    </Tabs>
  );
}
