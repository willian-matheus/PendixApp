import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Plus, Users, Trash2, ChevronLeft, BadgeCheck } from 'lucide-react-native';
import {
  getContratantes, createContratante, deleteContratante,
  type Contratante, type Formapagamento,
} from '@/services/contratantes';
import { BottomSheetModal } from '@/components/Modal';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Loader } from '@/components/Loader';

const FORMA_LABEL: Record<Formapagamento, string> = {
  cartao: 'Cartão de crédito',
  pix: 'Pix',
  boleto: 'Boleto bancário',
};

const FORMA_OPTS: { value: Formapagamento; label: string }[] = [
  { value: 'cartao', label: 'Cartão' },
  { value: 'pix', label: 'Pix' },
  { value: 'boleto', label: 'Boleto' },
];

function cpfMask(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

interface FormState { nome: string; cpf: string; email: string; forma_pagamento: Formapagamento | '' }
const EMPTY: FormState = { nome: '', cpf: '', email: '', forma_pagamento: '' };

export default function ContratantesScreen() {
  const router = useRouter();
  const [contratantes, setContratantes] = useState<Contratante[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setContratantes(await getContratantes());
    } catch (err) {
      console.error('[Contratantes] Falha ao carregar:', err);
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

  function openModal() {
    setForm(EMPTY);
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim() || !form.email.trim() || !form.forma_pagamento) {
      setError('Preencha nome, e-mail e forma de pagamento.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const novo = await createContratante({
        nome: form.nome.trim(),
        cpf: form.cpf.trim() || undefined,
        email: form.email.trim().toLowerCase(),
        forma_pagamento: form.forma_pagamento as Formapagamento,
        isento: false,
      });
      setContratantes((prev) => [...prev, novo]);
      setModalOpen(false);
    } catch (err: any) {
      setError(err?.message?.includes('unique') ? 'E-mail já cadastrado.' : (err?.message || 'Erro ao salvar.'));
    } finally {
      setSaving(false);
    }
  }

  function confirmarExclusao(contratante: Contratante) {
    Alert.alert('Remover contratante?', `"${contratante.nome}" será removido. Esta ação não pode ser desfeita.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          try {
            await deleteContratante(contratante.id);
            setContratantes((prev) => prev.filter((c) => c.id !== contratante.id));
          } catch (err: any) {
            Alert.alert('Erro', err.message || 'Não foi possível remover.');
          }
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="flex-row items-center justify-between px-5 mb-4">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 items-center justify-center">
            <ChevronLeft size={16} color="#9ca3af" />
          </Pressable>
          <Text className="text-xl font-bold text-white">Contratantes</Text>
        </View>
        <Pressable onPress={openModal} className="w-9 h-9 rounded-full bg-purple-600 items-center justify-center">
          <Plus size={18} color="#fff" />
        </Pressable>
      </View>

      {loading ? (
        <Loader />
      ) : (
        <FlatList
          data={contratantes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />}
          ListEmptyComponent={
            <EmptyState icon={Users} title="Nenhum contratante cadastrado." subtitle="Toque em + para cadastrar o primeiro." />
          }
          renderItem={({ item }) => (
            <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex-row items-center">
              <View className="w-9 h-9 rounded-full bg-purple-500/15 items-center justify-center mr-3">
                <Text className="text-purple-300 text-[11px] font-black">{item.nome.substring(0, 2).toUpperCase()}</Text>
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-white font-semibold text-sm" numberOfLines={1}>{item.nome}</Text>
                <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>{item.email}</Text>
                <View className="flex-row items-center gap-2 mt-1.5">
                  {item.isento ? (
                    <Badge label="Isento" tone="green" />
                  ) : (
                    <>
                      <Badge label="Ativo" tone="yellow" />
                      {!!item.forma_pagamento && <Badge label={FORMA_LABEL[item.forma_pagamento]} tone="blue" />}
                    </>
                  )}
                </View>
              </View>
              {!item.isento && (
                <Pressable onPress={() => confirmarExclusao(item)} className="p-2">
                  <Trash2 size={15} color="#6b7280" />
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      <BottomSheetModal visible={modalOpen} onClose={() => setModalOpen(false)} title="Novo contratante">
        <Input label="Nome *" value={form.nome} onChangeText={(v) => setForm((f) => ({ ...f, nome: v }))} placeholder="Nome completo" />
        <Input
          label="CPF" value={form.cpf} onChangeText={(v) => setForm((f) => ({ ...f, cpf: cpfMask(v) }))}
          placeholder="000.000.000-00" keyboardType="numeric"
        />
        <Input
          label="E-mail *" value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
          placeholder="email@exemplo.com" autoCapitalize="none" keyboardType="email-address"
        />
        <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Forma de pagamento *</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {FORMA_OPTS.map((o) => {
            const active = form.forma_pagamento === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => setForm((f) => ({ ...f, forma_pagamento: o.value }))}
                className={`px-3 py-2 rounded-lg border ${active ? 'bg-purple-600 border-purple-600' : 'border-white/10'}`}
              >
                <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-500'}`}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {!!error && (
          <View className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
            <Text className="text-red-400 text-xs">{error}</Text>
          </View>
        )}
        <Button label={saving ? 'Salvando...' : 'Salvar'} icon={BadgeCheck} onPress={handleSave} loading={saving} />
      </BottomSheetModal>
    </View>
  );
}
