import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ClipboardList, Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const { user, loading, error, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  if (!loading && user) return <Redirect href="/(app)" />;

  async function handleLogin() {
    if (!email || !senha) {
      setLocalError('Preencha todos os campos.');
      return;
    }
    setLocalError('');
    setSubmitting(true);
    try {
      await signIn(email, senha);
    } catch (err: any) {
      setLocalError(err.message || 'Não foi possível fazer login.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-pendix-bg"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Glow decorativo */}
        <View pointerEvents="none" style={{ position: 'absolute', top: '30%', left: '10%', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(139,92,246,0.10)' }} />

        <View className="w-full max-w-sm self-center">
          <View className="items-center mb-10">
            <View className="flex-row items-center gap-3 mb-4">
              <LinearGradient
                colors={['#a855f7', '#6d28d9']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
              >
                <ClipboardList size={24} color="#fff" />
              </LinearGradient>
              <Text className="text-4xl font-black tracking-widest uppercase text-white">PENDIX</Text>
            </View>
            <Text className="text-xs text-purple-400/70 tracking-[3px] uppercase">Gestão de Pendências</Text>
          </View>

          <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
            <Text className="text-lg font-semibold text-white mb-1">Bem-vindo de volta</Text>
            <Text className="text-xs text-gray-500 mb-6 tracking-wide">Acesse sua conta para continuar</Text>

            <View className="mb-4">
              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-[2px] mb-2">E-mail</Text>
              <View className="flex-row items-center bg-white/[0.05] border border-white/10 rounded-xl px-3.5">
                <Mail size={14} color="#6b7280" />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="seu@email.com"
                  placeholderTextColor="#4b5563"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="flex-1 text-white text-sm py-3 px-2.5"
                />
              </View>
            </View>

            <View className="mb-2">
              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-[2px] mb-2">Senha</Text>
              <View className="flex-row items-center bg-white/[0.05] border border-white/10 rounded-xl px-3.5">
                <Lock size={14} color="#6b7280" />
                <TextInput
                  value={senha}
                  onChangeText={setSenha}
                  placeholder="••••••••"
                  placeholderTextColor="#4b5563"
                  secureTextEntry={!showSenha}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  className="flex-1 text-white text-sm py-3 px-2.5"
                />
                <Pressable onPress={() => setShowSenha((v) => !v)} hitSlop={8}>
                  {showSenha ? <EyeOff size={14} color="#6b7280" /> : <Eye size={14} color="#6b7280" />}
                </Pressable>
              </View>
            </View>

            {!!localError && (
              <View className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-3">
                <Text className="text-red-400 text-xs">{localError}</Text>
              </View>
            )}

            <Pressable onPress={handleLogin} disabled={submitting} className="mt-5">
              <LinearGradient
                colors={['#9333ea', '#7c3aed']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text className="text-white font-bold text-sm tracking-wide">Entrar</Text>
                    <ArrowRight size={15} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          <Text className="text-center mt-6 text-[10px] text-gray-700 tracking-widest uppercase">
            Pendix © {new Date().getFullYear()} — Plataforma de Gestão
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
