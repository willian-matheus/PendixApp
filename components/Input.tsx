import { View, Text, TextInput, type TextInputProps } from 'react-native';

export function Input({
  label, error, icon: Icon, containerClassName = 'mb-4', ...props
}: TextInputProps & { label?: string; error?: string; icon?: any; containerClassName?: string }) {
  return (
    <View className={containerClassName}>
      {!!label && <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">{label}</Text>}
      <View
        className="flex-row items-center bg-white/[0.04] rounded-xl px-3.5"
        style={{ borderWidth: 1, borderColor: error ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.10)' }}
      >
        {!!Icon && <Icon size={14} color="#6b7280" />}
        <TextInput placeholderTextColor="#4b5563" className="flex-1 text-white text-sm py-3 px-2.5" {...props} />
      </View>
      {!!error && <Text className="text-red-400 text-xs mt-1.5">{error}</Text>}
    </View>
  );
}
