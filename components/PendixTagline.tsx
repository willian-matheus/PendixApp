import { Text, TextProps } from 'react-native';

// Poppins Medium, uppercase, letter-spacing 10.
export default function PendixTagline({ style, children, ...rest }: TextProps) {
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: 'Poppins_500Medium', letterSpacing: 10, textTransform: 'uppercase' },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
