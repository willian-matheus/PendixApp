import { Image } from 'react-native';

export type PendixLogoVariant = 'purple' | 'black' | 'white' | 'color';

const SOURCES: Record<PendixLogoVariant, ReturnType<typeof require>> = {
  purple: require('@/assets/pendix/logo-icon-purple.png'),
  black: require('@/assets/pendix/logo-icon-black.png'),
  white: require('@/assets/pendix/logo-icon-white.png'),
  color: require('@/assets/pendix/logo-icon-color.png'),
};

interface PendixLogoProps {
  variant?: PendixLogoVariant;
  size?: number;
}

// Ícone da marca Pendix. `variant` controla a cor do traço — 'color' usa o
// degradê azul/verde original da arte; as outras são silhuetas sólidas.
export default function PendixLogo({ variant = 'purple', size = 40 }: PendixLogoProps) {
  return (
    <Image
      source={SOURCES[variant]}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
