import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Check } from 'lucide-react-native';
import { getPendixClientes, postPendixPendencia, type PendixCliente } from '@/services/pendix';

export default function NovaPendenciaScreen() {
  const router = useRouter();
  const [clientes, setClientes] = useState<PendixCliente[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [nomeDocumento, setNomeDocumento] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [dataLimite, setDataLimite] = useState('');
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getPendixClientes()
      .then(setClientes)
      .catch((err) => console.error('[NovaPendencia] Falha ao carregar clientes:', err))
      .finally(() => setLoadingClientes(false));
  }, []);

  async function handleCriar() {
    if (!clienteId) { Alert.alert('Falta o cliente', 'Selecione um cliente.'); return; }
    if (!nomeDocumento.trim()) { Alert.alert('Falta o documento', 'Informe o nome do documento.'); return; }
    if (!/^\d{4}-\d{2}$/.test(competencia)) { Alert.alert('Competência inválida', 'Use o formato AAAA-MM, ex: 2026-08.'); return; }
    if (dataLimite && !/^\d{4}-\d{2}-\d{2}$/.test(dataLimite)) { Alert.alert('Prazo inválido', 'Use o formato AAAA-MM-DD, ex: 2026-08-15.'); return; }

    setSubmitting(true);
    try {
      await postPendixPendencia({
        escritorio_id: '',
        cliente_id: clienteId,
        nome_documento: nomeDocumento.trim(),
        competencia,
        status: 'pendente',
        data_limite: dataLimite || undefined,
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível criar a pendência.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="flex-row items-center justify-between px-5 mb-6">
        <Text className="text-lg font-bold text-white">Nova pendência</Text>
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 items-center justify-center">
          <X size={16} color="#9ca3af" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Cliente</Text>
        {loadingClientes ? (
          <ActivityIndicator color="#a78bfa" style={{ marginVertical: 12 }} />
        ) : (
          <View className="gap-2 mb-5">
            {clientes.map((c) => {
              const active = c.id === clienteId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setClienteId(c.id)}
                  className={`flex-row items-center justify-between px-4 py-3 rounded-xl border ${active ? 'bg-purple-600/20 border-purple-500/50' : 'bg-white/[0.03] border-white/10'}`}
                >
                  <Text className={`text-sm ${active ? 'text-white font-semibold' : 'text-gray-400'}`}>{c.nome}</Text>
                  {active && <Check size={15} color="#a78bfa" />}
                </Pressable>
              );
            })}
            {clientes.length === 0 && <Text className="text-gray-600 text-xs">Nenhum cliente cadastrado.</Text>}
          </View>
        )}

        <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Documento</Text>
        <TextInput
          value={nomeDocumento}
          onChangeText={setNomeDocumento}
          placeholder="Ex: Extrato Bancário"
          placeholderTextColor="#4b5563"
          className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-5"
        />

        <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Competência (AAAA-MM)</Text>
        <TextInput
          value={competencia}
          onChangeText={setCompetencia}
          placeholder="2026-08"
          placeholderTextColor="#4b5563"
          className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-5"
        />

        <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Prazo (AAAA-MM-DD, opcional)</Text>
        <TextInput
          value={dataLimite}
          onChangeText={setDataLimite}
          placeholder="2026-08-15"
          placeholderTextColor="#4b5563"
          className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-7"
        />

        <Pressable
          onPress={handleCriar}
          disabled={submitting}
          className="bg-purple-600 rounded-xl py-3.5 items-center"
          style={{ opacity: submitting ? 0.6 : 1 }}
        >
          <Text className="text-white font-bold text-sm">{submitting ? 'Criando...' : 'Criar pendência'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
