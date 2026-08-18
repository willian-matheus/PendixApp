import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Poppins_500Medium } from '@expo-google-fonts/poppins';
import { AuthProvider } from '@/context/AuthContext';
import { configurarHandlerNotificacoes, ouvirToqueEmNotificacao } from '@/services/notificacoes';

SplashScreen.preventAutoHideAsync();
configurarHandlerNotificacoes();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Baloo2_800ExtraBold, Poppins_500Medium });
  const router = useRouter();

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Tocar na notificação abre a pendência. `pendencia_id` é o payload que a
  // Edge Function manda em `data` — mesmo contrato do push e do in-app.
  useEffect(() => {
    // Devolve null onde notificações não existem (Expo Go no Android).
    const cancelar = ouvirToqueEmNotificacao((dados) => {
      if (dados.pendencia_id) router.push(`/(app)/pendencias/${dados.pendencia_id}`);
    });
    return cancelar ?? undefined;
  }, [router]);

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#06000f' } }} />
    </AuthProvider>
  );
}
