import { Text, View, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

interface PendixWordmarkProps {
  size?: number;
  color?: string;
}

// Wordmark "Pendix": Baloo 2 ExtraBold, com espaçamento entre letras, "x"
// final em degradê preto→roxo. `color` é branco por padrão porque as telas
// atuais têm fundo escuro — o #091426 do spec original só funciona sobre
// fundo claro.
//
// MaskedView não aplica a máscara corretamente no React Native Web (só
// mostra o elemento da máscara, sem o degradê por baixo) — por isso o "x"
// usa CSS background-clip:text no web e MaskedView+LinearGradient no nativo.
export default function PendixWordmark({ size = 40, color = '#ffffff' }: PendixWordmarkProps) {
  const textStyle = {
    fontFamily: 'Baloo2_800ExtraBold',
    letterSpacing: 2,
    fontSize: size,
    lineHeight: size,
  };

  const xElement = Platform.OS === 'web' ? (
    <Text
      style={[
        textStyle,
        {
          // @ts-expect-error — propriedades CSS web-only, react-native-web repassa pro DOM
          backgroundImage: 'linear-gradient(135deg, #000000, #9333ea)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
        },
      ]}
    >
      x
    </Text>
  ) : (
    <MaskedView
      style={{ height: size * 1.1 }}
      maskElement={<Text style={[textStyle, { color: '#000' }]}>x</Text>}
    >
      <LinearGradient
        colors={['#000000', '#9333ea']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: size * 0.8, height: size * 1.1 }}
      />
    </MaskedView>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={[textStyle, { color }]}>Pendi</Text>
      {xElement}
    </View>
  );
}
