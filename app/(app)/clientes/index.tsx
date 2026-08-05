import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, ActivityIndicator,
  RefreshControl, Modal, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Search, X, Users, Building2, User as UserIcon, Trash2, Pencil } from 'lucide-react-native';
import {
  getPendixClientes, postPendixCliente, updatePendixCliente, deletePendixCliente,
  type PendixCliente, type PendixRegime, type PendixClienteStatus, type PendixClienteTipo,
} from '@/services/pendix';

const STATUS_STYLE: Record<PendixClienteStatus, { bg: string; fg: string; label: string }> = {
  ativo: { bg: 'rgba(52,211,153,0.15)', fg: '#34d399', label: 'Ativo' },
  inativo: { bg: 'rgba(156,163,175,0.15)', fg: '#9ca3af', label: 'Inativo' },
  suspenso: { bg: 'rgba(250,204,21,0.15)', fg: '#facc15', label: 'Suspenso' },
};

const REGIME_OPTS: { value: PendixRegime; label: string }[] = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
  { value: 'mei', label: 'MEI' },
];

const EMPTY = {
  nome: '', responsavel: '', telefone: '', email: '',
  regime: 'simples_nacional' as PendixRegime,
  status: 'ativo' as PendixClienteStatus,
  tipo: 'pessoa' as PendixClienteTipo,
  observacoes: '',
};

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export default function ClientesScreen() {
  const [clientes, setClientes] = useState<PendixCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<PendixCliente | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      setClientes(await getPendixClientes());
    } catch (err) {
      console.error('[Clientes] Falha ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load({ silent: true }); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }

  function openModal(cliente?: PendixCliente) {
    if (cliente) {
      setEditando(cliente);
      setForm({
        nome: cliente.nome, responsavel: cliente.responsavel ?? '', telefone: cliente.telefone,
        email: cliente.email, regime: cliente.regime, status: cliente.status,
        tipo: cliente.tipo ?? 'pessoa', observacoes: cliente.observacoes ?? '',
      });
    } else {
      setEditando(null);
      setForm(EMPTY);
    }
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { setError('Informe o nome do cliente.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editando) {
        const atualizado = await updatePendixCliente(editando.id, form);
        setClientes((prev) => prev.map((c) => (c.id === editando.id ? atualizado : c)));
      } else {
        const novo = await postPendixCliente({ ...form, escritorio_id: '' });
        setClientes((prev) => [novo, ...prev]);
      }
      setModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar cliente.');
    } finally {
      setSaving(false);
    }
  }

  function confirmarExclusao(cliente: PendixCliente) {
    Alert.alert('Remover cliente?', `"${cliente.nome}" será removido. Esta ação não pode ser desfeita.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          try {
            await deletePendixCliente(cliente.id);
            setClientes((prev) => prev.filter((c) => c.id !== cliente.id));
          } catch (err: any) {
            Alert.alert('Erro', err.message || 'Não foi possível remover.');
          }
        },
      },
    ]);
  }

  const filtered = clientes.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.nome.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.telefone.includes(q);
  });

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="flex-row items-center justify-between px-5 mb-4">
        <Text className="text-xl font-bold text-white">Clientes</Text>
        <Pressable onPress={() => openModal()} className="w-9 h-9 rounded-full bg-purple-600 items-center justify-center">
          <Plus size={18} color="#fff" />
        </Pressable>
      </View>

      <View className="px-5 mb-4">
        <View className="flex-row items-center bg-white/[0.04] border border-white/10 rounded-xl px-3">
          <Search size={14} color="#6b7280" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome, e-mail ou WhatsApp..."
            placeholderTextColor="#4b5563"
            className="flex-1 text-white text-sm py-2.5 px-2.5"
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#a78bfa" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />}
          ListEmptyComponent={
            <View className="items-center mt-10">
              <Users size={24} color="#374151" />
              <Text className="text-gray-600 text-sm mt-3">
                {search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const s = STATUS_STYLE[item.status];
            const TipoIcon = (item.tipo ?? 'pessoa') === 'empresa' ? Building2 : UserIcon;
            return (
              <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex-row items-center">
                <View className="w-9 h-9 rounded-full bg-purple-500/15 items-center justify-center mr-3">
                  <Text className="text-purple-300 text-[11px] font-black">{iniciais(item.nome)}</Text>
                </View>
                <View className="flex-1 pr-2">
                  <View className="flex-row items-center gap-1.5">
                    <TipoIcon size={11} color="#6b7280" />
                    <Text className="text-white font-semibold text-sm" numberOfLines={1}>{item.nome}</Text>
                  </View>
                  <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>{item.email || item.telefone}</Text>
                  <View style={{ backgroundColor: s.bg, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 6 }}>
                    <Text style={{ color: s.fg, fontSize: 10, fontWeight: '700' }}>{s.label}</Text>
                  </View>
                </View>
                <Pressable onPress={() => openModal(item)} className="p-2">
                  <Pencil size={15} color="#6b7280" />
                </Pressable>
                <Pressable onPress={() => confirmarExclusao(item)} className="p-2">
                  <Trash2 size={15} color="#6b7280" />
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-[#0e0e1a] border-t border-white/10 rounded-t-3xl max-h-[88%]">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <Text className="text-white font-black text-base">{editando ? 'Editar cliente' : 'Novo cliente'}</Text>
              <Pressable onPress={() => setModalOpen(false)}><X size={18} color="#9ca3af" /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
              <View className="flex-row gap-3 mb-4">
                {(['pessoa', 'empresa'] as PendixClienteTipo[]).map((t) => {
                  const active = form.tipo === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setForm((f) => ({ ...f, tipo: t }))}
                      className={`flex-1 items-center py-2.5 rounded-xl border ${active ? 'bg-purple-500/15 border-purple-500/40' : 'border-white/10'}`}
                    >
                      <Text className={active ? 'text-purple-300 font-bold text-sm' : 'text-gray-500 text-sm'}>
                        {t === 'pessoa' ? 'Pessoa' : 'Empresa'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Nome / Razão social *</Text>
              <TextInput
                value={form.nome} onChangeText={(v) => setForm((f) => ({ ...f, nome: v }))}
                placeholder="Nome do cliente ou empresa" placeholderTextColor="#4b5563"
                className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-4"
              />

              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Responsável</Text>
              <TextInput
                value={form.responsavel} onChangeText={(v) => setForm((f) => ({ ...f, responsavel: v }))}
                placeholder="Nome do contato responsável" placeholderTextColor="#4b5563"
                className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-4"
              />

              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">WhatsApp</Text>
              <TextInput
                value={form.telefone} onChangeText={(v) => setForm((f) => ({ ...f, telefone: v }))}
                placeholder="(11) 99999-9999" placeholderTextColor="#4b5563" keyboardType="phone-pad"
                className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-4"
              />

              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">E-mail</Text>
              <TextInput
                value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                placeholder="email@exemplo.com" placeholderTextColor="#4b5563" keyboardType="email-address" autoCapitalize="none"
                className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-4"
              />

              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Regime tributário</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {REGIME_OPTS.map((r) => {
                  const active = form.regime === r.value;
                  return (
                    <Pressable
                      key={r.value}
                      onPress={() => setForm((f) => ({ ...f, regime: r.value }))}
                      className={`px-3 py-2 rounded-lg border ${active ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
                    >
                      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-500'}`}>{r.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Status</Text>
              <View className="flex-row gap-2 mb-4">
                {(['ativo', 'inativo', 'suspenso'] as PendixClienteStatus[]).map((s) => {
                  const active = form.status === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setForm((f) => ({ ...f, status: s }))}
                      className={`px-3 py-2 rounded-lg border ${active ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
                    >
                      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-500'}`}>{STATUS_STYLE[s].label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Observações</Text>
              <TextInput
                value={form.observacoes} onChangeText={(v) => setForm((f) => ({ ...f, observacoes: v }))}
                placeholder="Informações adicionais..." placeholderTextColor="#4b5563"
                multiline numberOfLines={3}
                className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-4"
                style={{ textAlignVertical: 'top', minHeight: 80 }}
              />

              {!!error && (
                <View className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
                  <Text className="text-red-400 text-xs">{error}</Text>
                </View>
              )}

              <Pressable onPress={handleSave} disabled={saving} className="bg-purple-600 rounded-xl py-3.5 items-center" style={{ opacity: saving ? 0.6 : 1 }}>
                <Text className="text-white font-bold text-sm">
                  {saving ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar cliente'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
