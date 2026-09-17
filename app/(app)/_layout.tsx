import { useCallback, useEffect, useState } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { View, Text, ActivityIndicator, AppState } from 'react-native';
import { Home, ClipboardList, Users, MoreHorizontal } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { getAssinatura, assinaturaEmDia } from '@/services/assinatura';
import AssinaturaScreen from './assinatura';

function TabIcon({ focused, color, Icon, label }: { focused: boolean; color: any; Icon: any; label: string }) {
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

/**
 * Portão de assinatura: sem pagamento em dia, todas as telas do escritório
 * dão lugar à tela de assinatura (espelha RequireAssinatura do PendixWeb).
 *
 * O usuário CONTINUA logado — os dados dele ficam intactos esperando do outro
 * lado do pagamento. Isto NÃO é a fronteira de segurança: quem protege os
 * dados de verdade são as policies de RLS, que não dependem desta tela.
 */
function useAssinaturaEmDia(officeId: string | undefined) {
  const [emDia, setEmDia] = useState<boolean | null>(null);

  const checar = useCallback(() => {
    if (!officeId) { setEmDia(true); return; }
    getAssinatura()
      .then((a) => setEmDia(assinaturaEmDia(a)))
      .catch(() => setEmDia(true));
  }, [officeId]);

  useEffect(() => { checar(); }, [checar]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checar();
    });
    return () => sub.remove();
  }, [checar]);

  return emDia;
}

export default function AppLayout() {
  const { user, loading } = useAuth();
  const emDia = useAssinaturaEmDia(user?.officeId);

  if (loading || (!!user && emDia === null)) {
    return (
      <View className="flex-1 bg-pendix-bg items-center justify-center">
        <ActivityIndicator color="#a78bfa" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  if (!emDia) return <AssinaturaScreen bloqueado />;

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
      <Tabs.Screen name="empresas" options={{ href: null }} />
      <Tabs.Screen name="contratantes" options={{ href: null }} />
      <Tabs.Screen name="assinatura" options={{ href: null }} />
      <Tabs.Screen name="calendario" options={{ href: null }} />
      <Tabs.Screen name="historico" options={{ href: null }} />
      <Tabs.Screen name="notificacoes" options={{ href: null }} />
      <Tabs.Screen name="configuracoes" options={{ href: null }} />
    </Tabs>
  );
}
