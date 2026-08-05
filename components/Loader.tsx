import { View, ActivityIndicator, Text, type ViewStyle } from 'react-native';

export function Loader({ label, style }: { label?: string; style?: ViewStyle }) {
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }, style]}>
      <ActivityIndicator color="#a78bfa" />
      {!!label && <Text className="text-gray-500 text-xs mt-3">{label}</Text>}
    </View>
  );
}
