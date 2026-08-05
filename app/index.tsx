import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 bg-pendix-bg items-center justify-center">
        <ActivityIndicator color="#a78bfa" />
      </View>
    );
  }

  return <Redirect href={user ? '/(app)' : '/login'} />;
}
