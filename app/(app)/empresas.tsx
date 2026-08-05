import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Plus, Search, Building2, Trash2, Pencil, Eye, ChevronLeft, Phone, Mail } from 'lucide-react-native';
import {
  getEmpresas, criarEmpresa, atualizarEmpresa, excluirEmpresa,
  type Empresa, type EmpresaStatus,
} from '@/services/empresasLocal';
import { BottomSheetModal } from '@/components/Modal';
import { Input } from '@/components/Input';
import { Select } from '@/components/Select';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Loader } from '@/components/Loader';

const STATUS_OPTS: { value: EmpresaStatus; label: string }[] = [
  { value: 'ativa', label: 'Ativa' },
  { value: 'inativa', label: 'Inativa' },
];

const EMPTY = { nome: '', telefone: '', email: '', observacoes: '', status: 'ativa' as EmpresaStatus };

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'EM';
}

export default function EmpresasScreen() {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [viewing, setViewing] = useState<Empresa | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEmpresas(await getEmpresas());
    } catch (err) {
      console.error('[Empresas] Falha ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openModal(empresa?: Empresa) {
    if (empresa) {
      setEditando(empresa);
      setForm({ nome: empresa.nome, telefone: empresa.telefone, email: empresa.email, observacoes: empresa.observacoes, status: empresa.status });
    } else {
      setEditando(null);
      setForm(EMPTY);
    }
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { setError('Informe o nome da empresa.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editando) {
        const atualizada = await atualizarEmpresa(editando.id, form);
        setEmpresas((prev) => prev.map((e) => (e.id === editando.id ? atualizada : e)));
      } else {
        const nova = await criarEmpresa(form);
        setEmpresas((prev) => [nova, ...prev]);
      }
      setModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar empresa.');
    } finally {
      setSaving(false);
    }
  }

  function confirmarExclusao(empresa: Empresa) {
    Alert.alert('Remover empresa?', `"${empresa.nome}" será removida. Esta ação não pode ser desfeita.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          try {
            await excluirEmpresa(empresa.id);
            setEmpresas((prev) => prev.filter((e) => e.id !== empresa.id));
          } catch (err: any) {
            Alert.alert('Erro', err.message || 'Não foi possível remover.');
          }
        },
      },
    ]);
  }

  const filtered = empresas.filter((e) => {
    const q = search.toLowerCase();
    return !q || e.nome.toLowerCase().includes(q) || e.email.toLowerCase().includes(q);
  });

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="flex-row items-center justify-between px-5 mb-4">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 items-center justify-center">
            <ChevronLeft size={16} color="#9ca3af" />
          </Pressable>
          <Text className="text-xl font-bold text-white">Empresas</Text>
        </View>
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
            placeholder="Buscar por nome ou e-mail..."
            placeholderTextColor="#4b5563"
            className="flex-1 text-white text-sm py-2.5 px-2.5"
          />
        </View>
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
              icon={Building2}
              title={search ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa cadastrada.'}
              subtitle={search ? undefined : 'Toque em + para cadastrar a primeira.'}
            />
          }
          renderItem={({ item }) => (
            <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex-row items-center">
              <View className="w-9 h-9 rounded-full bg-blue-500/15 items-center justify-center mr-3">
                <Text className="text-blue-300 text-[11px] font-black">{iniciais(item.nome)}</Text>
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-white font-semibold text-sm" numberOfLines={1}>{item.nome}</Text>
                <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>{item.email || item.telefone || '—'}</Text>
                <View className="mt-1.5">
                  <Badge label={item.status === 'ativa' ? 'Ativa' : 'Inativa'} tone={item.status === 'ativa' ? 'green' : 'gray'} />
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
          )}
        />
      )}

      {/* Novo / Editar */}
      <BottomSheetModal visible={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar empresa' : 'Nova empresa'}>
        <Input label="Nome da empresa *" value={form.nome} onChangeText={(v) => setForm((f) => ({ ...f, nome: v }))} placeholder="Razão social" />
        <Input label="Telefone" icon={Phone} value={form.telefone} onChangeText={(v) => setForm((f) => ({ ...f, telefone: v }))} placeholder="(11) 4000-0000" keyboardType="phone-pad" />
        <Input label="E-mail" icon={Mail} value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="contato@empresa.com" autoCapitalize="none" keyboardType="email-address" />
        <Select label="Status" options={STATUS_OPTS} value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v }))} />
        <Input
          label="Observações" value={form.observacoes} onChangeText={(v) => setForm((f) => ({ ...f, observacoes: v }))}
          placeholder="Informações adicionais..." multiline numberOfLines={3}
          style={{ textAlignVertical: 'top', minHeight: 80 }}
        />
        {!!error && (
          <View className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
            <Text className="text-red-400 text-xs">{error}</Text>
          </View>
        )}
        <Button label={saving ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar empresa'} onPress={handleSave} loading={saving} />
      </BottomSheetModal>

      {/* Visualizar */}
      <BottomSheetModal visible={!!viewing} onClose={() => setViewing(null)} title="Detalhes da empresa" maxHeight="60%">
        {!!viewing && (
          <View>
            <View className="items-center mb-5">
              <View className="w-16 h-16 rounded-full bg-blue-500/15 items-center justify-center mb-3">
                <Text className="text-blue-300 text-lg font-black">{iniciais(viewing.nome)}</Text>
              </View>
              <Text className="text-white font-bold text-base text-center">{viewing.nome}</Text>
              <View className="mt-2">
                <Badge label={viewing.status === 'ativa' ? 'Ativa' : 'Inativa'} tone={viewing.status === 'ativa' ? 'green' : 'gray'} />
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
            </View>
            {!!viewing.observacoes && (
              <View className="mt-4">
                <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Observações</Text>
                <Text className="text-gray-400 text-sm leading-relaxed">{viewing.observacoes}</Text>
              </View>
            )}
            <View className="mt-6">
              <Button label="Editar" variant="outline" icon={Pencil} onPress={() => { const e = viewing; setViewing(null); openModal(e); }} />
            </View>
          </View>
        )}
      </BottomSheetModal>
    </View>
  );
}
