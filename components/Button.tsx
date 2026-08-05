import { Pressable, Text, ActivityIndicator } from 'react-native';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

const VARIANT_STYLE: Record<ButtonVariant, { bg: string; border?: string; fg: string }> = {
  primary: { bg: '#7c3aed', fg: '#fff' },
  outline: { bg: 'transparent', border: 'rgba(255,255,255,0.14)', fg: '#e5e7eb' },
  ghost: { bg: 'rgba(255,255,255,0.04)', fg: '#e5e7eb' },
  danger: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.25)', fg: '#f87171' },
};

export function Button({
  label, onPress, variant = 'primary', icon: Icon, loading, disabled, fullWidth = true,
}: {
  label: string; onPress: () => void; variant?: ButtonVariant; icon?: any;
  loading?: boolean; disabled?: boolean; fullWidth?: boolean;
}) {
  const s = VARIANT_STYLE[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={{
        backgroundColor: s.bg,
        borderWidth: s.border ? 1 : 0,
        borderColor: s.border,
        borderRadius: 12,
        paddingVertical: 13,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: isDisabled ? 0.6 : 1,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={s.fg} />
      ) : (
        <>
          {!!Icon && <Icon size={15} color={s.fg} />}
          <Text style={{ color: s.fg, fontWeight: '700', fontSize: 14 }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
