import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput,
  RefreshControl, Modal, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Search, X, Users, Building2, User as UserIcon, Trash2, Pencil, Eye, Phone, Mail } from 'lucide-react-native';
import {
  getPendixClientes, postPendixCliente, updatePendixCliente, deletePendixCliente,
  type PendixCliente, type PendixRegime, type PendixClienteStatus, type PendixClienteTipo,
} from '@/services/pendix';
import { getEmpresas, getVinculosEmpresa, setVinculoEmpresa, type Empresa } from '@/services/empresasLocal';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Loader } from '@/components/Loader';

const STATUS_STYLE: Record<PendixClienteStatus, { tone: 'green' | 'gray' | 'yellow'; label: string }> = {
  ativo: { tone: 'green', label: 'Ativo' },
  inativo: { tone: 'gray', label: 'Inativo' },
  suspenso: { tone: 'yellow', label: 'Suspenso' },
};

const STATUS_FILTROS: { value: PendixClienteStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'suspenso', label: 'Suspenso' },
];

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
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [vinculos, setVinculos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<PendixClienteStatus | 'todos'>('todos');

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<PendixCliente | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [empresaVinculadaId, setEmpresaVinculadaId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [viewing, setViewing] = useState<PendixCliente | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [cli, emp, vinc] = await Promise.all([getPendixClientes(), getEmpresas(), getVinculosEmpresa()]);
      setClientes(cli);
      setEmpresas(emp);
      setVinculos(vinc);
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
      setEmpresaVinculadaId(vinculos[cliente.id] ?? null);
    } else {
      setEditando(null);
      setForm(EMPTY);
      setEmpresaVinculadaId(null);
    }
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { setError('Informe o nome do cliente.'); return; }
    setSaving(true);
    setError('');
    try {
      let clienteId: string;
      if (editando) {
        const atualizado = await updatePendixCliente(editando.id, form);
        setClientes((prev) => prev.map((c) => (c.id === editando.id ? atualizado : c)));
        clienteId = editando.id;
      } else {
        const novo = await postPendixCliente({ ...form, escritorio_id: '' });
        setClientes((prev) => [novo, ...prev]);
        clienteId = novo.id;
      }
      await setVinculoEmpresa(clienteId, empresaVinculadaId);
      setVinculos((prev) => {
        const next = { ...prev };
        if (empresaVinculadaId) next[clienteId] = empresaVinculadaId;
        else delete next[clienteId];
        return next;
      });
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
    const matchesSearch = !q || c.nome.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.telefone.includes(q);
    const matchesStatus = statusFiltro === 'todos' || c.status === statusFiltro;
    return matchesSearch && matchesStatus;
  });

  function empresaNome(clienteId: string) {
    const empId = vinculos[clienteId];
    if (!empId) return null;
    return empresas.find((e) => e.id === empId)?.nome ?? null;
  }

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="flex-row items-center justify-between px-5 mb-4">
        <Text className="text-xl font-bold text-white">Clientes</Text>
        <Pressable onPress={() => openModal()} className="w-9 h-9 rounded-full bg-purple-600 items-center justify-center">
          <Plus size={18} color="#fff" />
        </Pressable>
      </View>

      <View className="px-5 mb-3">
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

      <View className="px-5 mb-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {STATUS_FILTROS.map((f) => {
              const active = statusFiltro === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => setStatusFiltro(f.value)}
                  className={`px-3.5 py-2 rounded-lg border ${active ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
                >
                  <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-500'}`}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {loading ? (
        <Loader />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />}
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              title={search || statusFiltro !== 'todos' ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
            />
          }
          renderItem={({ item }) => {
            const s = STATUS_STYLE[item.status];
            const TipoIcon = (item.tipo ?? 'pessoa') === 'empresa' ? Building2 : UserIcon;
            const vinculada = empresaNome(item.id);
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
                  {!!vinculada && <Text className="text-blue-400/80 text-[10px] mt-0.5" numberOfLines={1}>{vinculada}</Text>}
                  <View className="mt-1.5">
                    <Badge label={s.label} tone={s.tone} />
                  </View>
                </View>
                <Pressable onPress={() => setViewing(item)} className="p-2">
                  <Eye size={15} color="#6b7280" />
                </Pressable>
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

              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Empresa vinculada</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => setEmpresaVinculadaId(null)}
                    className={`px-3 py-2 rounded-lg border ${!empresaVinculadaId ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
                  >
                    <Text className={`text-xs font-semibold ${!empresaVinculadaId ? 'text-white' : 'text-gray-500'}`}>Nenhuma</Text>
                  </Pressable>
                  {empresas.map((e) => {
                    const active = empresaVinculadaId === e.id;
                    return (
                      <Pressable
                        key={e.id}
                        onPress={() => setEmpresaVinculadaId(e.id)}
                        className={`px-3 py-2 rounded-lg border ${active ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
                      >
                        <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-500'}`} numberOfLines={1}>{e.nome}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

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

      <Modal visible={!!viewing} animationType="slide" transparent onRequestClose={() => setViewing(null)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-[#0e0e1a] border-t border-white/10 rounded-t-3xl max-h-[75%]">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <Text className="text-white font-black text-base">Detalhes do cliente</Text>
              <Pressable onPress={() => setViewing(null)}><X size={18} color="#9ca3af" /></Pressable>
            </View>
            {!!viewing && (
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
                <View className="items-center mb-5">
                  <View className="w-16 h-16 rounded-full bg-purple-500/15 items-center justify-center mb-3">
                    <Text className="text-purple-300 text-lg font-black">{iniciais(viewing.nome)}</Text>
                  </View>
                  <Text className="text-white font-bold text-base text-center">{viewing.nome}</Text>
                  <View className="mt-2">
                    <Badge label={STATUS_STYLE[viewing.status].label} tone={STATUS_STYLE[viewing.status].tone} />
                  </View>
                </View>
                <View className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 gap-3">
                  <View className="flex-row items-center gap-2">
                    <Phone size={13} color="#6b7280" />
                    <Text className="text-gray-300 text-sm">{viewing.telefone || 'Não informado'}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Mail size={13} color="#6b7280" />
                    <Text className="text-gray-300 text-sm">{viewing.email || 'Não informado'}</Text>
                  </View>
                  {!!viewing.responsavel && (
                    <View className="flex-row items-center gap-2">
                      <UserIcon size={13} color="#6b7280" />
                      <Text className="text-gray-300 text-sm">{viewing.responsavel}</Text>
                    </View>
                  )}
                  {!!empresaNome(viewing.id) && (
                    <View className="flex-row items-center gap-2">
                      <Building2 size={13} color="#6b7280" />
                      <Text className="text-gray-300 text-sm">{empresaNome(viewing.id)}</Text>
                    </View>
                  )}
                </View>
                {!!viewing.observacoes && (
                  <View className="mt-4">
                    <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Observações</Text>
                    <Text className="text-gray-400 text-sm leading-relaxed">{viewing.observacoes}</Text>
                  </View>
                )}
                <Pressable
                  onPress={() => { const c = viewing; setViewing(null); openModal(c); }}
                  className="flex-row items-center justify-center gap-2 border border-white/10 rounded-xl py-3 mt-6"
                >
                  <Pencil size={14} color="#e5e7eb" />
                  <Text className="text-gray-200 font-bold text-sm">Editar</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
