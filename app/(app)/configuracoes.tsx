import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Switch, Alert } from 'react-native';
import {
  Bot, Check, Clock, LogOut, Save, Pencil, Shield, Palette, CreditCard, Sun, Moon,
} from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getPendixConfiguracaoCobranca, salvarPendixConfiguracaoCobranca, type PendixConfiguracaoCobranca } from '@/services/pendix';
import { getPreferenciasAparencia, salvarPreferenciasAparencia, CORES_DISPONIVEIS, type Tema } from '@/services/preferenciasLocal';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'US';
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador', super_admin: 'Administrador', dono_escritorio: 'Dono do escritório',
  contador: 'Contador', cliente_empresa: 'Cliente',
};

export default function ConfiguracoesScreen() {
  const { user, signOut, updateProfile } = useAuth();

  // Perfil
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [nomePerfil, setNomePerfil] = useState(user?.nome ?? '');
  const [telefonePerfil, setTelefonePerfil] = useState(user?.telefone ?? '');
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [perfilSalvo, setPerfilSalvo] = useState(false);

  // Segurança
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState('');
  const [senhaAlterada, setSenhaAlterada] = useState(false);

  // Aparência
  const [tema, setTema] = useState<Tema>('escuro');
  const [corPrincipal, setCorPrincipal] = useState(CORES_DISPONIVEIS[0]);

  // Agente de cobrança
  const [cobranca, setCobranca] = useState<PendixConfiguracaoCobranca | null>(null);
  const [cobrancaLoading, setCobrancaLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPendixConfiguracaoCobranca()
      .then(setCobranca)
      .catch((err) => console.error('[Configurações] Falha ao carregar regras:', err))
      .finally(() => setCobrancaLoading(false));
    getPreferenciasAparencia().then((p) => { setTema(p.tema); setCorPrincipal(p.corPrincipal); });
  }, []);

  function setCampo<K extends keyof Omit<PendixConfiguracaoCobranca, 'escritorio_id'>>(k: K, v: PendixConfiguracaoCobranca[K]) {
    setCobranca((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  async function salvarRegras() {
    if (!cobranca) return;
    setSaving(true);
    try {
      const { escritorio_id, ...resto } = cobranca;
      const salva = await salvarPendixConfiguracaoCobranca(resto);
      setCobranca(salva);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('[Configurações] Falha ao salvar regras:', err);
    } finally {
      setSaving(false);
    }
  }

  function abrirEdicaoPerfil() {
    setNomePerfil(user?.nome ?? '');
    setTelefonePerfil(user?.telefone ?? '');
    setEditandoPerfil(true);
  }

  async function salvarPerfil() {
    setSalvandoPerfil(true);
    try {
      await updateProfile({ nome: nomePerfil.trim(), telefone: telefonePerfil.trim() });
      setEditandoPerfil(false);
      setPerfilSalvo(true);
      setTimeout(() => setPerfilSalvo(false), 3000);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o perfil.');
    } finally {
      setSalvandoPerfil(false);
    }
  }

  async function trocarSenha() {
    setErroSenha('');
    if (!senhaAtual || !novaSenha || !confirmarSenha) { setErroSenha('Preencha todos os campos.'); return; }
    if (novaSenha.length < 6) { setErroSenha('A nova senha deve ter pelo menos 6 caracteres.'); return; }
    if (novaSenha !== confirmarSenha) { setErroSenha('As senhas não coincidem.'); return; }

    setTrocandoSenha(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user?.email ?? '', password: senhaAtual });
      if (reauthError) throw new Error('Senha atual incorreta.');

      const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha });
      if (updateError) throw updateError;

      setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha('');
      setSenhaAlterada(true);
      setTimeout(() => setSenhaAlterada(false), 3000);
    } catch (err: any) {
      setErroSenha(err.message || 'Não foi possível trocar a senha.');
    } finally {
      setTrocandoSenha(false);
    }
  }

  async function selecionarTema(t: Tema) {
    setTema(t);
    await salvarPreferenciasAparencia({ tema: t, corPrincipal });
  }

  async function selecionarCor(cor: string) {
    setCorPrincipal(cor);
    await salvarPreferenciasAparencia({ tema, corPrincipal: cor });
  }

  return (
    <ScrollView className="flex-1 bg-pendix-bg" contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 48 }}>
      <Text className="text-xl font-bold text-white mb-1">Configurações</Text>
      <Text className="text-gray-500 text-xs mb-6">Sua conta, segurança, aparência e as regras do agente</Text>

      {/* Perfil */}
      <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 mb-4">
        {perfilSalvo && (
          <View className="flex-row items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-4">
            <Check size={14} color="#34d399" />
            <Text className="text-emerald-400 text-sm font-semibold">Perfil atualizado!</Text>
          </View>
        )}

        {editandoPerfil ? (
          <>
            <Text className="text-white font-black text-base mb-4">Editar perfil</Text>
            <Input label="Nome" value={nomePerfil} onChangeText={setNomePerfil} placeholder="Seu nome" />
            <Input label="Telefone" value={telefonePerfil} onChangeText={setTelefonePerfil} placeholder="(11) 99999-9999" keyboardType="phone-pad" />
            <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">E-mail</Text>
            <View className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 mb-5">
              <Text className="text-gray-500 text-sm">{user?.email}</Text>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button label="Cancelar" variant="outline" onPress={() => setEditandoPerfil(false)} />
              </View>
              <View className="flex-1">
                <Button label="Salvar" onPress={salvarPerfil} loading={salvandoPerfil} />
              </View>
            </View>
          </>
        ) : (
          <View className="flex-row items-center gap-4">
            <View className="w-14 h-14 rounded-full bg-purple-600 items-center justify-center">
              <Text className="text-white text-lg font-black">{iniciais(user?.nome || '')}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold text-base" numberOfLines={1}>{user?.nome || 'Usuário'}</Text>
              <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>{user?.email}</Text>
              {!!user?.telefone && <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>{user.telefone}</Text>}
              {!!user?.role && (
                <View className="self-start bg-purple-500/15 px-2.5 py-0.5 rounded-full mt-1.5">
                  <Text className="text-purple-300 text-[10px] font-bold">{ROLE_LABEL[user.role] ?? user.role}</Text>
                </View>
              )}
            </View>
            <Pressable onPress={abrirEdicaoPerfil} className="p-2">
              <Pencil size={16} color="#9ca3af" />
            </Pressable>
          </View>
        )}
      </View>

      {/* Segurança */}
      <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 mb-4">
        <View className="flex-row items-center gap-2 mb-1">
          <Shield size={15} color="#a78bfa" />
          <Text className="text-white font-black text-base">Segurança</Text>
        </View>
        <Text className="text-gray-500 text-xs mb-5">Altere sua senha de acesso</Text>

        {senhaAlterada && (
          <View className="flex-row items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-4">
            <Check size={14} color="#34d399" />
            <Text className="text-emerald-400 text-sm font-semibold">Senha alterada com sucesso!</Text>
          </View>
        )}

        <Input label="Senha atual" value={senhaAtual} onChangeText={setSenhaAtual} placeholder="••••••••" secureTextEntry />
        <Input label="Nova senha" value={novaSenha} onChangeText={setNovaSenha} placeholder="••••••••" secureTextEntry />
        <Input label="Confirmar nova senha" value={confirmarSenha} onChangeText={setConfirmarSenha} placeholder="••••••••" secureTextEntry containerClassName="mb-2" />

        {!!erroSenha && (
          <View className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-3 mb-1">
            <Text className="text-red-400 text-xs">{erroSenha}</Text>
          </View>
        )}

        <View className="mt-4">
          <Button label="Alterar senha" onPress={trocarSenha} loading={trocandoSenha} />
        </View>
      </View>

      {/* Aparência */}
      <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 mb-4">
        <View className="flex-row items-center gap-2 mb-1">
          <Palette size={15} color="#a78bfa" />
          <Text className="text-white font-black text-base">Aparência</Text>
        </View>
        <Text className="text-gray-500 text-xs mb-5">Sua preferência é salva no aparelho</Text>

        <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Tema</Text>
        <View className="flex-row gap-3 mb-5">
          <Pressable
            onPress={() => selecionarTema('escuro')}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border ${tema === 'escuro' ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
          >
            <Moon size={14} color={tema === 'escuro' ? '#fff' : '#9ca3af'} />
            <Text className={`text-sm font-semibold ${tema === 'escuro' ? 'text-white' : 'text-gray-500'}`}>Escuro</Text>
          </Pressable>
          <Pressable
            onPress={() => selecionarTema('claro')}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border ${tema === 'claro' ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
          >
            <Sun size={14} color={tema === 'claro' ? '#fff' : '#9ca3af'} />
            <Text className={`text-sm font-semibold ${tema === 'claro' ? 'text-white' : 'text-gray-500'}`}>Claro</Text>
          </Pressable>
        </View>

        <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Cor principal</Text>
        <View className="flex-row items-center gap-3">
          {CORES_DISPONIVEIS.map((cor) => (
            <Pressable
              key={cor}
              onPress={() => selecionarCor(cor)}
              style={{
                width: 34, height: 34, borderRadius: 17, backgroundColor: cor,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: corPrincipal === cor ? 2 : 0, borderColor: '#fff',
              }}
            >
              {corPrincipal === cor && <Check size={14} color="#fff" />}
            </Pressable>
          ))}
        </View>
      </View>

      {/* Regras de cobrança do agente */}
      <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 mb-4">
        <View className="flex-row items-center gap-2 mb-1">
          <Bot size={15} color="#a78bfa" />
          <Text className="text-white font-black text-base">Agente de cobrança</Text>
        </View>
        <Text className="text-gray-500 text-xs mb-5 leading-relaxed">
          Controla quantos dias em aberto levam a cada nível de cobrança e quando o agente pode mandar mensagem no WhatsApp.
        </Text>

        {saved && (
          <View className="flex-row items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-5">
            <Check size={14} color="#34d399" />
            <Text className="text-emerald-400 text-sm font-semibold">Regras salvas com sucesso!</Text>
          </View>
        )}

        {cobrancaLoading || !cobranca ? (
          <ActivityIndicator color="#a78bfa" />
        ) : (
          <>
            <View className="flex-row gap-3 mb-4">
              {([
                ['dias_amigavel', 'Amigável'], ['dias_lembrete', 'Lembrete'], ['dias_urgente', 'Urgente'],
              ] as const).map(([key, label]) => (
                <View key={key} className="flex-1">
                  <Text className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">{label} (dias)</Text>
                  <TextInput
                    value={String(cobranca[key])}
                    onChangeText={(v) => setCampo(key, Number(v.replace(/\D/g, '')) || 0)}
                    keyboardType="number-pad"
                    className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm text-center"
                  />
                </View>
              ))}
            </View>
            <Text className="text-gray-700 text-[10px] mb-4">Acima de "Urgente" o nível vira Crítico.</Text>

            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <View className="flex-row items-center gap-1 mb-1.5">
                  <Clock size={10} color="#6b7280" />
                  <Text className="text-[10px] font-bold text-gray-500 uppercase">Início</Text>
                </View>
                <TextInput
                  value={cobranca.horario_inicio}
                  onChangeText={(v) => setCampo('horario_inicio', v)}
                  placeholder="08:00" placeholderTextColor="#4b5563"
                  className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm text-center"
                />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1 mb-1.5">
                  <Clock size={10} color="#6b7280" />
                  <Text className="text-[10px] font-bold text-gray-500 uppercase">Fim</Text>
                </View>
                <TextInput
                  value={cobranca.horario_fim}
                  onChangeText={(v) => setCampo('horario_fim', v)}
                  placeholder="19:00" placeholderTextColor="#4b5563"
                  className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm text-center"
                />
              </View>
            </View>

            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Máx. reenvios</Text>
                <TextInput
                  value={String(cobranca.max_reenvios)}
                  onChangeText={(v) => setCampo('max_reenvios', Number(v.replace(/\D/g, '')) || 1)}
                  keyboardType="number-pad"
                  className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm text-center"
                />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Intervalo (h)</Text>
                <TextInput
                  value={String(cobranca.cooldown_horas)}
                  onChangeText={(v) => setCampo('cooldown_horas', Number(v.replace(/\D/g, '')) || 1)}
                  keyboardType="number-pad"
                  className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm text-center"
                />
              </View>
            </View>

            <View className="flex-row items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 mb-5">
              <Text className="text-gray-300 text-sm flex-1 pr-3">Cobrança automática ativada para este escritório</Text>
              <Switch
                value={cobranca.ativo}
                onValueChange={(v) => setCampo('ativo', v)}
                trackColor={{ false: '#374151', true: '#9333ea' }}
                thumbColor="#fff"
              />
            </View>

            <Pressable onPress={salvarRegras} disabled={saving} className="bg-purple-600 rounded-xl py-3 flex-row items-center justify-center gap-2" style={{ opacity: saving ? 0.6 : 1 }}>
              <Save size={14} color="#fff" />
              <Text className="text-white font-bold text-sm">{saving ? 'Salvando...' : 'Salvar regras'}</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Conta */}
      <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 mb-4">
        <View className="flex-row items-center gap-2 mb-4">
          <CreditCard size={15} color="#a78bfa" />
          <Text className="text-white font-black text-base">Conta</Text>
        </View>

        <View className="flex-row items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 mb-3">
          <Text className="text-gray-400 text-sm">Plano atual</Text>
          <Badge label={user?.plano === 'pro' ? 'Pro' : 'Normal'} tone={user?.plano === 'pro' ? 'purple' : 'gray'} />
        </View>
        <View className="flex-row items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 mb-5">
          <Text className="text-gray-400 text-sm">Data de renovação</Text>
          <Text className="text-gray-500 text-xs">Não disponível</Text>
        </View>

        <Button
          label="Alterar plano" variant="outline"
          onPress={() => Alert.alert('Alterar plano', 'Em breve você poderá gerenciar seu plano por aqui.')}
        />
      </View>

      {/* Sair */}
      <View className="bg-white/[0.04] border border-red-500/10 rounded-2xl p-5">
        <Text className="text-white font-black text-base mb-1">Sair da conta</Text>
        <Text className="text-gray-500 text-sm mb-4">Você será redirecionado para a tela de login.</Text>
        <Pressable onPress={() => signOut()} className="flex-row items-center justify-center gap-2 bg-red-600/20 border border-red-500/20 rounded-xl py-3">
          <LogOut size={14} color="#f87171" />
          <Text className="text-red-400 font-bold text-sm">Sair do Pendix</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
