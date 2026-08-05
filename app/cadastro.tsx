import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ClipboardList, User, Mail, Phone, IdCard, Lock, Check } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';

const EMPTY = { nome: '', email: '', telefone: '', documento: '', senha: '', confirmarSenha: '' };

export default function CadastroScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!loading && user) return <Redirect href="/(app)" />;

  function setCampo<K extends keyof typeof EMPTY>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validar(): string | null {
    if (!form.nome.trim()) return 'Informe seu nome completo.';
    if (!form.email.trim()) return 'Informe seu e-mail.';
    if (!form.telefone.trim()) return 'Informe seu telefone.';
    if (!form.documento.trim()) return 'Informe seu CPF ou CNPJ.';
    if (form.senha.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
    if (form.senha !== form.confirmarSenha) return 'As senhas não coincidem.';
    return null;
  }

  async function handleCriarConta() {
    const validacao = validar();
    if (validacao) { setError(validacao); return; }
    setError('');
    setSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.senha,
        options: {
          data: {
            nome: form.nome.trim(),
            telefone: form.telefone.trim(),
            documento: form.documento.trim(),
            role: 'dono_escritorio',
          },
        },
      });
      if (signUpError) throw signUpError;
      if (data.session) {
        router.replace('/(app)');
      } else {
        setDone(true);
      }
    } catch (err: any) {
      setError(err.message || 'Não foi possível criar sua conta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-pendix-bg">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <View pointerEvents="none" style={{ position: 'absolute', top: '20%', right: '10%', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(139,92,246,0.10)' }} />

        <View className="w-full max-w-sm self-center">
          <View className="items-center mb-8">
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
            <Text className="text-xs text-purple-400/70 tracking-[3px] uppercase">Criar conta</Text>
          </View>

          {done ? (
            <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 items-center">
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(52,211,153,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Check size={24} color="#34d399" />
              </View>
              <Text className="text-white font-semibold text-base text-center">Conta criada!</Text>
              <Text className="text-gray-500 text-xs text-center mt-2 leading-relaxed">
                Enviamos um e-mail de confirmação para {form.email}. Confirme para poder entrar.
              </Text>
              <View className="mt-6 w-full">
                <Button label="Ir para o login" onPress={() => router.replace('/login')} />
              </View>
            </View>
          ) : (
            <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
              <Text className="text-lg font-semibold text-white mb-1">Crie sua conta</Text>
              <Text className="text-xs text-gray-500 mb-6 tracking-wide">Leva menos de um minuto</Text>

              <Input label="Nome completo" icon={User} value={form.nome} onChangeText={(v) => setCampo('nome', v)} placeholder="Seu nome completo" />
              <Input label="E-mail" icon={Mail} value={form.email} onChangeText={(v) => setCampo('email', v)} placeholder="seu@email.com" autoCapitalize="none" keyboardType="email-address" />
              <Input label="Telefone" icon={Phone} value={form.telefone} onChangeText={(v) => setCampo('telefone', v)} placeholder="(11) 99999-9999" keyboardType="phone-pad" />
              <Input label="CPF ou CNPJ" icon={IdCard} value={form.documento} onChangeText={(v) => setCampo('documento', v)} placeholder="000.000.000-00" keyboardType="number-pad" />
              <Input label="Senha" icon={Lock} value={form.senha} onChangeText={(v) => setCampo('senha', v)} placeholder="••••••••" secureTextEntry />
              <Input label="Confirmar senha" icon={Lock} value={form.confirmarSenha} onChangeText={(v) => setCampo('confirmarSenha', v)} placeholder="••••••••" secureTextEntry containerClassName="mb-2" />

              {!!error && (
                <View className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-3 mb-1">
                  <Text className="text-red-400 text-xs">{error}</Text>
                </View>
              )}

              <View className="mt-5">
                <Button label="Criar conta" onPress={handleCriarConta} loading={submitting} />
              </View>
            </View>
          )}

          <Pressable onPress={() => router.replace('/login')} className="mt-6 flex-row items-center justify-center gap-1.5">
            <Text className="text-gray-500 text-xs">Já possui conta?</Text>
            <Text className="text-purple-400 text-xs font-bold">Entrar</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
