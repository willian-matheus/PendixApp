import type { ReactNode } from 'react';
import { View, Text, Pressable, Modal as RNModal, ScrollView, type DimensionValue } from 'react-native';
import { X } from 'lucide-react-native';

export function BottomSheetModal({
  visible, onClose, title, children, maxHeight = '88%',
}: {
  visible: boolean; onClose: () => void; title: string; children: ReactNode; maxHeight?: DimensionValue;
}) {
  return (
    <RNModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/70 justify-end">
        <View className="bg-[#0e0e1a] border-t border-white/10 rounded-t-3xl" style={{ maxHeight }}>
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <Text className="text-white font-black text-base">{title}</Text>
            <Pressable onPress={onClose}><X size={18} color="#9ca3af" /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </RNModal>
  );
}
