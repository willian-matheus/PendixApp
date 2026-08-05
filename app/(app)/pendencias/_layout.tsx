import { Stack } from 'expo-router';

export default function PendenciasLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#06000f' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="nova" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
