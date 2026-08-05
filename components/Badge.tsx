import { View, Text } from 'react-native';

export type BadgeTone = 'purple' | 'blue' | 'green' | 'red' | 'yellow' | 'gray';

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  purple: { bg: 'rgba(167,139,250,0.15)', fg: '#c4b5fd' },
  blue: { bg: 'rgba(96,165,250,0.15)', fg: '#93c5fd' },
  green: { bg: 'rgba(52,211,153,0.15)', fg: '#34d399' },
  red: { bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
  yellow: { bg: 'rgba(250,204,21,0.15)', fg: '#facc15' },
  gray: { bg: 'rgba(156,163,175,0.15)', fg: '#9ca3af' },
};

export function Badge({ label, tone = 'gray' }: { label: string; tone?: BadgeTone }) {
  const t = TONES[tone];
  return (
    <View style={{ backgroundColor: t.bg, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: t.fg, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}
