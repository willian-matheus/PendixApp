import { View, Text, Pressable } from 'react-native';

export function Select<T extends string>({
  label, options, value, onChange,
}: {
  label?: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View className="mb-4">
      {!!label && <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">{label}</Text>}
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              className={`px-3 py-2 rounded-lg border ${active ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
            >
              <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-500'}`}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
