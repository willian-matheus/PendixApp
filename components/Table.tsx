import type { ReactNode } from 'react';
import { View, Text, ScrollView } from 'react-native';

export interface TableColumn<T> {
  key: string;
  label: string;
  width?: number;
  render: (item: T) => ReactNode;
}

export function Table<T extends { id: string }>({ columns, data }: { columns: TableColumn<T>[]; data: T[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View className="flex-row border-b border-white/10 pb-2 mb-1">
          {columns.map((c) => (
            <View key={c.key} style={{ width: c.width ?? 130 }} className="px-2">
              <Text className="text-gray-500 text-[10px] font-bold uppercase">{c.label}</Text>
            </View>
          ))}
        </View>
        {data.map((row) => (
          <View key={row.id} className="flex-row items-center border-b border-white/[0.05] py-3">
            {columns.map((c) => (
              <View key={c.key} style={{ width: c.width ?? 130 }} className="px-2">
                {c.render(row)}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
