import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, ArrowRight, Eye, EyeOff, Check } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { BottomSheetModal } from '@/components/Modal';
import PendixLogo from '@/components/PendixLogo';
import PendixWordmark from '@/components/PendixWordmark';
import PendixTagline from '@/components/PendixTagline';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';

export default function LoginScreen() {
  const { user, loading, error, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

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

  function openReset() {
    setResetEmail(email);
    setResetSent(false);
    setResetError('');
    setResetOpen(true);
  }

  async function handleResetPassword() {
    if (!resetEmail) {
      setResetError('Informe seu e-mail.');
      return;
    }
    setResetError('');
    setResetSending(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail);
      if (resetErr) throw resetErr;
      setResetSent(true);
    } catch (err: any) {
      setResetError(err.message || 'Não foi possível enviar o link de redefinição.');
    } finally {
      setResetSending(false);
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
        <View className="w-full max-w-sm self-center">
          <View className="items-center mb-10">
            <View className="flex-row items-center gap-3 mb-4">
              <PendixLogo variant="white" size={48} />
              <PendixWordmark size={40} />
            </View>
            <PendixTagline className="text-xs text-purple-400/70">Gestão de Pendências</PendixTagline>
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

            <Pressable onPress={openReset} hitSlop={6} className="self-end mb-1">
              <Text className="text-purple-400 text-xs font-semibold">Esqueci minha senha</Text>
            </Pressable>

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

          <Pressable onPress={() => router.push('/cadastro')} className="mt-6 flex-row items-center justify-center gap-1.5">
            <Text className="text-gray-500 text-xs">Não tem uma conta?</Text>
            <Text className="text-purple-400 text-xs font-bold">Criar conta</Text>
          </Pressable>

          <Text className="text-center mt-6 text-[10px] text-gray-700 tracking-widest uppercase">
            Pendix © {new Date().getFullYear()} — Plataforma de Gestão
          </Text>
        </View>
      </ScrollView>

      <BottomSheetModal visible={resetOpen} onClose={() => setResetOpen(false)} title="Recuperar senha" maxHeight="60%">
        {resetSent ? (
          <View className="items-center py-4">
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(52,211,153,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Check size={22} color="#34d399" />
            </View>
            <Text className="text-white font-semibold text-sm text-center">Link enviado!</Text>
            <Text className="text-gray-500 text-xs text-center mt-1.5">
              Confira sua caixa de entrada em {resetEmail} para redefinir sua senha.
            </Text>
            <View className="mt-6 w-full">
              <Button label="Fechar" variant="outline" onPress={() => setResetOpen(false)} />
            </View>
          </View>
        ) : (
          <>
            <Text className="text-gray-500 text-xs mb-5">
              Informe o e-mail da sua conta e enviaremos um link para redefinir sua senha.
            </Text>
            <Input
              label="E-mail"
              icon={Mail}
              value={resetEmail}
              onChangeText={setResetEmail}
              placeholder="seu@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {!!resetError && (
              <View className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
                <Text className="text-red-400 text-xs">{resetError}</Text>
              </View>
            )}
            <Button label="Enviar link" onPress={handleResetPassword} loading={resetSending} />
          </>
        )}
      </BottomSheetModal>
    </KeyboardAvoidingView>
  );
}
