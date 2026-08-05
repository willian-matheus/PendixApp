import { Redirect, Tabs } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import {
  LayoutDashboard, ClipboardList, Users, Calendar, History, Bell, Settings,
} from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';

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
        tabBarStyle: { backgroundColor: '#08000f', borderTopColor: 'rgba(255,255,255,0.06)', height: 58, paddingTop: 8 },
        tabBarActiveTintColor: '#a78bfa',
        tabBarInactiveTintColor: '#4b5563',
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={21} /> }} />
      <Tabs.Screen name="pendencias" options={{ tabBarIcon: ({ color }) => <ClipboardList color={color} size={21} /> }} />
      <Tabs.Screen name="clientes" options={{ tabBarIcon: ({ color }) => <Users color={color} size={21} /> }} />
      <Tabs.Screen name="calendario" options={{ tabBarIcon: ({ color }) => <Calendar color={color} size={21} /> }} />
      <Tabs.Screen name="historico" options={{ tabBarIcon: ({ color }) => <History color={color} size={21} /> }} />
      <Tabs.Screen name="notificacoes" options={{ tabBarIcon: ({ color }) => <Bell color={color} size={21} /> }} />
      <Tabs.Screen name="configuracoes" options={{ tabBarIcon: ({ color }) => <Settings color={color} size={21} /> }} />
    </Tabs>
  );
}
