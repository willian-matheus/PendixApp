import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Check, Paperclip } from 'lucide-react-native';
import { getPendixClientes, postPendixPendencia, type PendixCliente, type PendixPendenciaTipo, type PendixPrioridade } from '@/services/pendix';
import { getEmpresas, getVinculosEmpresa, type Empresa } from '@/services/empresasLocal';
import { PERIODICIDADE_OPTS, PERIODICIDADE_PADRAO, PERIODICIDADE_LABEL, PERIODICIDADE_DESCRICAO, FREQUENCIA_COBRANCA_OPTS, ehRecorrente, type PendixPeriodicidade } from '@/lib/periodicidade';
import { FREQUENCIA_COBRANCA_PADRAO, inicioDaCobranca } from '@/lib/cobranca';
import { salvarPendenciaExtra } from '@/services/pendenciasExtra';
import { Select } from '@/components/Select';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Loader } from '@/components/Loader';

const PRIORIDADE_OPTS: { value: PendixPrioridade; label: string }[] = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const MAX_NOTIFICACOES_EXTRA = 3;

export default function NovaPendenciaScreen() {
  const router = useRouter();
  const [clientes, setClientes] = useState<PendixCliente[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [vinculos, setVinculos] = useState<Record<string, string>>({});
  const [loadingDados, setLoadingDados] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [tipo, setTipo] = useState<PendixPendenciaTipo>('cliente');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [todosClientesEmpresa, setTodosClientesEmpresa] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<PendixPrioridade>('media');
  const [periodicidade, setPeriodicidade] = useState<PendixPeriodicidade>(PERIODICIDADE_PADRAO);
  const [cobrancaAutomatica, setCobrancaAutomatica] = useState(true);
  const [cobrancaFrequencia, setCobrancaFrequencia] = useState<PendixPeriodicidade>(FREQUENCIA_COBRANCA_PADRAO);
  const [competencia, setCompetencia] = useState('');
  const [dataLimite, setDataLimite] = useState('');
  const [dataInicialCobranca, setDataInicialCobranca] = useState('');
  const [horarioNotificacao, setHorarioNotificacao] = useState('09:00');
  const [notificarMultiplasVezes, setNotificarMultiplasVezes] = useState(false);
  const [datasNotificacao, setDatasNotificacao] = useState<string[]>(['', '', '']);
  const [anexoNome, setAnexoNome] = useState('');
  const [observacaoInterna, setObservacaoInterna] = useState('');

  useEffect(() => {
    Promise.all([getPendixClientes(), getEmpresas(), getVinculosEmpresa()])
      .then(([cli, emp, vinc]) => { setClientes(cli); setEmpresas(emp); setVinculos(vinc); })
      .catch((err) => console.error('[NovaPendencia] Falha ao carregar dados:', err))
      .finally(() => setLoadingDados(false));
  }, []);

  const clientesDaEmpresa = empresaId ? clientes.filter((c) => vinculos[c.id] === empresaId) : [];

  async function handleCriar() {
    if (!titulo.trim()) { Alert.alert('Falta o título', 'Informe o título da pendência.'); return; }
    if (!/^\d{4}-\d{2}$/.test(competencia)) { Alert.alert('Competência inválida', 'Use o formato AAAA-MM, ex: 2026-08.'); return; }
    if (dataLimite && !/^\d{4}-\d{2}-\d{2}$/.test(dataLimite)) { Alert.alert('Vencimento inválido', 'Use o formato AAAA-MM-DD, ex: 2026-08-15.'); return; }
    if (dataInicialCobranca && !/^\d{4}-\d{2}-\d{2}$/.test(dataInicialCobranca)) { Alert.alert('Data inicial inválida', 'Use o formato AAAA-MM-DD, ex: 2026-08-01.'); return; }
    if (!/^\d{2}:\d{2}$/.test(horarioNotificacao)) { Alert.alert('Horário inválido', 'Use o formato HH:MM, ex: 09:00.'); return; }

    let clienteIds: string[] = [];
    if (tipo === 'cliente') {
      if (!clienteId) { Alert.alert('Falta o cliente', 'Selecione um cliente.'); return; }
      clienteIds = [clienteId];
    } else {
      if (!empresaId) { Alert.alert('Falta a empresa', 'Selecione uma empresa.'); return; }
      if (todosClientesEmpresa) {
        if (clientesDaEmpresa.length === 0) { Alert.alert('Sem clientes', 'Essa empresa ainda não tem clientes vinculados.'); return; }
        clienteIds = clientesDaEmpresa.map((c) => c.id);
      } else {
        if (!clienteId) { Alert.alert('Falta o cliente', 'Selecione um cliente específico da empresa.'); return; }
        clienteIds = [clienteId];
      }
    }

    setSubmitting(true);
    try {
      const datasNotificacaoValidas = notificarMultiplasVezes ? datasNotificacao.filter(Boolean) : [];
      for (const cid of clienteIds) {
        const pendencia = await postPendixPendencia({
          escritorio_id: '',
          cliente_id: cid,
          nome_documento: titulo.trim(),
          competencia,
          status: 'pendente',
          data_limite: dataLimite || undefined,
          observacoes: observacaoInterna || undefined,
          tipo,
          descricao: descricao || undefined,
          prioridade,
          data_inicio_cobranca: dataInicialCobranca || undefined,
          horario_notificacao: horarioNotificacao,
          periodicidade,
          cobranca_automatica: cobrancaAutomatica,
          cobranca_frequencia: cobrancaFrequencia,
          // Mesma regra da ocorrência gerada por recorrência: sem data de
          // início, a cobrança começa quando a competência começa — assim uma
          // pendência aberta hoje para setembro não cobra o cliente em agosto.
          proxima_cobranca_em: inicioDaCobranca({ data_inicio_cobranca: dataInicialCobranca, competencia }),
          datas_notificacao: datasNotificacaoValidas,
          arquivo_modelo_nome: anexoNome || undefined,
        });
        if (tipo === 'empresa' && empresaId) {
          await salvarPendenciaExtra(pendencia.id, { empresaId });
        }
      }
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

      {loadingDados ? (
        <Loader />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Select
            label="Tipo"
            value={tipo}
            onChange={(v) => { setTipo(v); setClienteId(null); setEmpresaId(null); setTodosClientesEmpresa(false); }}
            options={[{ value: 'cliente', label: 'Cliente' }, { value: 'empresa', label: 'Empresa' }]}
          />

          {tipo === 'cliente' ? (
            <View className="mb-5">
              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Cliente</Text>
              <View className="gap-2">
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
            </View>
          ) : (
            <>
              <View className="mb-5">
                <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Empresa</Text>
                <View className="gap-2">
                  {empresas.map((e) => {
                    const active = e.id === empresaId;
                    return (
                      <Pressable
                        key={e.id}
                        onPress={() => { setEmpresaId(e.id); setClienteId(null); }}
                        className={`flex-row items-center justify-between px-4 py-3 rounded-xl border ${active ? 'bg-purple-600/20 border-purple-500/50' : 'bg-white/[0.03] border-white/10'}`}
                      >
                        <Text className={`text-sm ${active ? 'text-white font-semibold' : 'text-gray-400'}`}>{e.nome}</Text>
                        {active && <Check size={15} color="#a78bfa" />}
                      </Pressable>
                    );
                  })}
                  {empresas.length === 0 && <Text className="text-gray-600 text-xs">Nenhuma empresa cadastrada.</Text>}
                </View>
              </View>

              {!!empresaId && (
                <View className="mb-5">
                  <Select
                    label="Clientes da empresa"
                    value={todosClientesEmpresa ? 'todos' : 'especifico'}
                    onChange={(v) => setTodosClientesEmpresa(v === 'todos')}
                    options={[{ value: 'especifico', label: 'Cliente específico' }, { value: 'todos', label: 'Todos os clientes' }]}
                  />
                  {!todosClientesEmpresa && (
                    <View className="gap-2 mt-1">
                      {clientesDaEmpresa.map((c) => {
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
                      {clientesDaEmpresa.length === 0 && (
                        <Text className="text-gray-600 text-xs">Nenhum cliente vinculado a esta empresa ainda.</Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          <Input label="Título da pendência" value={titulo} onChangeText={setTitulo} placeholder="Ex: Extrato Bancário" />
          <Input
            label="Descrição" value={descricao} onChangeText={setDescricao} placeholder="Detalhes sobre o que é necessário..."
            multiline numberOfLines={3} style={{ textAlignVertical: 'top', minHeight: 70 }}
          />

          <Select label="Prioridade" value={prioridade} onChange={setPrioridade} options={PRIORIDADE_OPTS} />

          <Select label="Periodicidade" value={periodicidade} onChange={setPeriodicidade} options={PERIODICIDADE_OPTS} containerClassName="mb-2" />
          <Text className="text-gray-500 text-[11px] mb-5 leading-4">
            {ehRecorrente(periodicidade)
              ? `${PERIODICIDADE_LABEL[periodicidade]} — ${PERIODICIDADE_DESCRICAO[periodicidade]}. Ao marcar como recebida, a próxima ocorrência é criada sozinha, com competência e datas já avançadas.`
              : 'Evento único: quando for recebida, acabou.'}
          </Text>

          <Input label="Competência (AAAA-MM)" value={competencia} onChangeText={setCompetencia} placeholder="2026-08" />
          <Input label="Data de vencimento (AAAA-MM-DD, opcional)" value={dataLimite} onChangeText={setDataLimite} placeholder="2026-08-15" />
          <Input label="Data inicial da cobrança (AAAA-MM-DD, opcional)" value={dataInicialCobranca} onChangeText={setDataInicialCobranca} placeholder="2026-08-01" />
          <Input
            label="Horário de notificação (HH:MM)" value={horarioNotificacao} onChangeText={setHorarioNotificacao} placeholder="09:00"
          />

          {/* Cobrança automática — quem precisa entregar o documento é o
              cliente, então é o WhatsApp dele que recebe a mensagem. */}
          <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-5">
            <Pressable onPress={() => setCobrancaAutomatica((v) => !v)} className="flex-row items-center gap-2.5">
              <View
                className="w-4 h-4 rounded items-center justify-center"
                style={{ borderWidth: 1, borderColor: cobrancaAutomatica ? '#9333ea' : 'rgba(255,255,255,0.2)', backgroundColor: cobrancaAutomatica ? '#9333ea' : 'transparent' }}
              >
                {cobrancaAutomatica && <Check size={11} color="#fff" />}
              </View>
              <Text className="text-sm text-white font-semibold flex-1">Cobrar o cliente automaticamente</Text>
            </Pressable>

            {cobrancaAutomatica ? (
              <>
                <Text className="text-gray-500 text-[11px] leading-4 mt-2 mb-3">
                  O agente manda a cobrança no WhatsApp do cliente sozinho, subindo o tom conforme o
                  atraso, até o documento chegar ou o teto de reenvios do escritório ser atingido.
                </Text>
                <Select
                  label="Repetir a cobrança"
                  value={cobrancaFrequencia}
                  onChange={setCobrancaFrequencia}
                  options={FREQUENCIA_COBRANCA_OPTS}
                  containerClassName="mb-2"
                />
                <Text className="text-gray-500 text-[11px] leading-4">
                  {PERIODICIDADE_LABEL[cobrancaFrequencia]} — {PERIODICIDADE_DESCRICAO[cobrancaFrequencia]}.
                  {' '}A primeira sai na data inicial acima; em branco, no primeiro dia da competência.
                </Text>
              </>
            ) : (
              <Text className="text-gray-500 text-[11px] leading-4 mt-2">
                Só o contato inicial e os lembretes marcados abaixo. Ninguém mais é cobrado sozinho.
              </Text>
            )}
          </View>

          <Pressable
            onPress={() => setNotificarMultiplasVezes((v) => !v)}
            className="flex-row items-center gap-2.5 mb-3"
          >
            <View
              className="w-4 h-4 rounded items-center justify-center"
              style={{ borderWidth: 1, borderColor: notificarMultiplasVezes ? '#9333ea' : 'rgba(255,255,255,0.2)', backgroundColor: notificarMultiplasVezes ? '#9333ea' : 'transparent' }}
            >
              {notificarMultiplasVezes && <Check size={11} color="#fff" />}
            </View>
            <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
              Notificar mais de uma vez (até {MAX_NOTIFICACOES_EXTRA}x)
            </Text>
          </Pressable>
          {notificarMultiplasVezes && (
            <View className="flex-row gap-2 mb-4">
              {datasNotificacao.map((data, i) => (
                <View key={i} className="flex-1">
                  <Input
                    label={`${i + 1}ª notificação`}
                    value={data}
                    onChangeText={(v) => setDatasNotificacao((prev) => { const next = [...prev]; next[i] = v; return next; })}
                    placeholder="2026-08-15"
                    containerClassName="mb-0"
                  />
                </View>
              ))}
            </View>
          )}

          <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Anexo de exemplo</Text>
          <Pressable
            onPress={() => setAnexoNome(anexoNome ? '' : 'modelo-documento.pdf')}
            className="flex-row items-center bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 mb-4"
          >
            <Paperclip size={14} color="#a78bfa" />
            <Text className="text-sm text-gray-300 ml-2.5 flex-1">
              {anexoNome || 'Toque para anexar um arquivo modelo'}
            </Text>
            {!!anexoNome && <X size={14} color="#6b7280" />}
          </Pressable>

          <Input
            label="Observação interna" value={observacaoInterna} onChangeText={setObservacaoInterna} placeholder="Anotações visíveis só pra equipe..."
            multiline numberOfLines={3} containerClassName="mb-7" style={{ textAlignVertical: 'top', minHeight: 70 }}
          />

          <Button label={submitting ? 'Criando...' : 'Criar pendência'} onPress={handleCriar} loading={submitting} />
        </ScrollView>
      )}
    </View>
  );
}
