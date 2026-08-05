import { View, Text, Pressable } from 'react-native';

export function EmptyState({ icon: Icon, title, subtitle, actionLabel, onAction }: {
  icon: any; title: string; subtitle?: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View className="items-center py-14 px-6">
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Icon size={22} color="#4b5563" />
      </View>
      <Text className="text-gray-400 font-semibold text-sm text-center">{title}</Text>
      {!!subtitle && <Text className="text-gray-600 text-xs mt-1.5 text-center">{subtitle}</Text>}
      {!!actionLabel && !!onAction && (
        <Pressable onPress={onAction} className="mt-5 bg-purple-600 rounded-xl px-5 py-2.5">
          <Text className="text-white font-bold text-xs">{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
