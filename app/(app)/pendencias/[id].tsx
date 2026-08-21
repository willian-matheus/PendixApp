import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowLeft, User, Calendar, FileText, Check, Send, MessageCircle, FileCheck, PartyPopper, Paperclip,
  Download, Repeat, Megaphone, BellOff,
} from 'lucide-react-native';
import {
  getPendixPendencia, getPendixConversaMensagens, updatePendixPendenciaStatus, getUrlAssinadaAnexo,
  getPendixConfiguracaoCobranca, setCobrancaAutomatica,
  type PendixPendencia, type PendixMensagem, type PendixConfiguracaoCobranca,
} from '@/services/pendix';
import {
  calcularProximaOcorrencia, descreverPeriodicidade, ehRecorrente,
} from '@/lib/periodicidade';
import { decidirCobranca, descreverCobranca, MOTIVO_TEXTO } from '@/lib/cobranca';
import { Badge } from '@/components/Badge';
import { Loader } from '@/components/Loader';

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
}

function formatDateTime(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Linha de anexo com download. O bucket `pendix-anexos` é privado, então não
 * existe URL direta: cada toque gera uma URL assinada de curta duração e
 * entrega ao navegador do sistema, que baixa o arquivo.
 */
function AnexoLinha({ nome, path, legenda }: { nome: string; path?: string; legenda: string }) {
  const [baixando, setBaixando] = useState(false);

  async function abrir() {
    if (!path) {
      Alert.alert('Anexo indisponível', 'Este anexo não tem arquivo associado no storage.');
      return;
    }
    setBaixando(true);
    try {
      const url = await getUrlAssinadaAnexo(path);
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert('Falha ao baixar', err?.message ?? 'Não foi possível gerar o link do arquivo.');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Pressable
      onPress={abrir}
      disabled={baixando}
      className="flex-row items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-3"
    >
      <Paperclip size={14} color="#a78bfa" />
      <View className="flex-1">
        <Text className="text-gray-300 text-sm" numberOfLines={1}>{nome}</Text>
        <Text className="text-gray-600 text-[10px] mt-0.5">{legenda}</Text>
      </View>
      {baixando
        ? <ActivityIndicator size="small" color="#a78bfa" />
        : <Download size={14} color="#6b7280" />}
    </Pressable>
  );
}

/** "Agora" no fuso do aparelho, no formato que lib/cobranca.ts espera. */
function agoraLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    minutos: d.getHours() * 60 + d.getMinutes(),
    iso: d.toISOString(),
  };
}

function formatHorario(horario?: string) {
  return horario ? horario.slice(0, 5) : '—';
}

const NIVEL_LABEL: Record<string, string> = {
  amigavel: 'Amigável', lembrete: 'Lembrete', urgente: 'Urgente', critico: 'Crítico',
};

const PRIORIDADE_TONE: Record<string, 'red' | 'yellow' | 'gray'> = {
  urgente: 'red', alta: 'red', media: 'yellow', baixa: 'gray',
};
const PRIORIDADE_LABEL: Record<string, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
};

interface Etapa {
  key: string;
  label: string;
  icon: any;
  done: boolean;
  data?: string;
}

export default function PendenciaDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pendencia, setPendencia] = useState<PendixPendencia | null>(null);
  const [mensagens, setMensagens] = useState<PendixMensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [regras, setRegras] = useState<PendixConfiguracaoCobranca | null>(null);
  const [alternandoCobranca, setAlternandoCobranca] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, conversa, cfg] = await Promise.all([
        getPendixPendencia(id), getPendixConversaMensagens(id), getPendixConfiguracaoCobranca(),
      ]);
      setPendencia(p);
      setMensagens(conversa.mensagens);
      setRegras(cfg);
    } catch (err) {
      console.error('[PendenciaDetalhe] Falha ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function marcarRecebido() {
    if (!id) return;
    setUpdating(true);
    try {
      const atualizado = await updatePendixPendenciaStatus(id, 'recebido');
      setPendencia(atualizado);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível atualizar a pendência.');
    } finally {
      setUpdating(false);
    }
  }

  async function alternarCobranca(ligar: boolean) {
    if (!id) return;
    setAlternandoCobranca(true);
    try {
      setPendencia(await setCobrancaAutomatica(id, ligar));
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível alterar a cobrança automática.');
    } finally {
      setAlternandoCobranca(false);
    }
  }

  if (loading) return <Loader style={{ flex: 1 }} />;

  if (!pendencia) {
    return (
      <View className="flex-1 bg-pendix-bg items-center justify-center px-6">
        <Text className="text-gray-500 text-sm text-center">Pendência não encontrada.</Text>
      </View>
    );
  }

  const recorrencia = (() => {
    if (!ehRecorrente(pendencia.periodicidade)) return null;
    const descricao = descreverPeriodicidade(pendencia.periodicidade)!;
    // A competência inválida faz `calcularProximaOcorrencia` lançar — aqui é
    // só uma prévia informativa, então uma pendência velha sem competência
    // padrão não deve derrubar a tela.
    // Depois de recebida a próxima ocorrência já existe de verdade; anunciar
    // "próxima competência" aqui apontaria para uma pendência que já está na
    // lista, como se ainda fosse nascer.
    if (pendencia.status !== 'pendente') return { descricao, proximaCompetencia: undefined };
    try {
      return { descricao, proximaCompetencia: calcularProximaOcorrencia(pendencia)?.competencia };
    } catch {
      return { descricao, proximaCompetencia: undefined };
    }
  })();

  // Por que o cliente (não) vai ser cobrado — a MESMA regra que o cron roda,
  // então a tela nunca promete uma cobrança que não vai sair.
  const cobranca = (() => {
    if (!regras) return null;
    const decisao = decidirCobranca(
      {
        status: pendencia.status,
        cobranca_automatica: pendencia.cobranca_automatica,
        cobranca_frequencia: pendencia.cobranca_frequencia,
        proxima_cobranca_em: pendencia.proxima_cobranca_em,
        cobrancas_enviadas: pendencia.cobrancas_enviadas,
        horario_notificacao: pendencia.horario_notificacao,
        data_inicio_cobranca: pendencia.data_inicio_cobranca,
        ultima_mensagem_enviada_em: pendencia.ultima_mensagem_enviada_em,
        cliente: pendencia.pendix_clientes,
      },
      regras,
      agoraLocal(),
    );
    return {
      resumo: descreverCobranca(pendencia, regras.max_reenvios),
      // Só vale avisar de bloqueio enquanto a pendência ainda está de pé.
      impedimento: !decisao.cobrar && pendencia.status === 'pendente' && decisao.motivo
        && !['ainda_nao_e_dia', 'antes_do_horario', 'fora_da_janela', 'em_cooldown'].includes(decisao.motivo)
        ? MOTIVO_TEXTO[decisao.motivo] : null,
    };
  })();

  const mensagemAgente = mensagens.find((m) => m.remetente === 'agente');
  const mensagemCliente = mensagens.find((m) => m.remetente === 'cliente');
  const concluida = pendencia.status === 'recebido';

  const etapas: Etapa[] = [
    { key: 'criada', label: 'Pendência criada', icon: FileText, done: true, data: pendencia.created_at },
    { key: 'enviada', label: 'Cobrança enviada', icon: Send, done: !!(pendencia.ultima_mensagem_enviada_em || mensagemAgente), data: pendencia.ultima_mensagem_enviada_em || mensagemAgente?.criada_em },
    { key: 'respondeu', label: 'Cliente respondeu', icon: MessageCircle, done: !!mensagemCliente, data: mensagemCliente?.criada_em },
    { key: 'recebido', label: 'Documento recebido', icon: FileCheck, done: concluida, data: pendencia.data_recebimento },
    { key: 'concluida', label: 'Pendência concluída', icon: PartyPopper, done: concluida, data: pendencia.data_recebimento },
  ];

  return (
    <ScrollView className="flex-1 bg-pendix-bg" contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
      <View className="flex-row items-center gap-3 mb-6">
        <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 items-center justify-center">
          <ArrowLeft size={16} color="#9ca3af" />
        </Pressable>
        <Text className="text-lg font-bold text-white flex-1" numberOfLines={1}>{pendencia.nome_documento}</Text>
      </View>

      {/* Dados gerais */}
      <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-4">
        <View className="flex-row items-center gap-2 mb-2.5">
          <User size={14} color="#a78bfa" />
          <Text className="text-white text-sm font-semibold">{pendencia.pendix_clientes?.nome ?? 'Cliente'}</Text>
        </View>
        <View className="flex-row items-center gap-2 mb-2.5">
          <FileText size={14} color="#6b7280" />
          <Text className="text-gray-400 text-xs">Competência {pendencia.competencia}</Text>
        </View>
        <View className="flex-row items-center gap-2 mb-2.5">
          <Calendar size={14} color="#6b7280" />
          <Text className="text-gray-400 text-xs">Prazo {formatDate(pendencia.data_limite)}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Send size={14} color="#6b7280" />
          <Text className="text-gray-400 text-xs">
            Cobrança inicial {formatDate(pendencia.data_inicio_cobranca)} às {formatHorario(pendencia.horario_notificacao)}
            {!!pendencia.datas_notificacao?.length && ` · lembretes em ${pendencia.datas_notificacao.map(formatDate).join(', ')}`}
          </Text>
        </View>
        {recorrencia && (
          <View className="flex-row items-center gap-2 mt-2.5">
            <Repeat size={14} color="#6b7280" />
            <Text className="text-gray-400 text-xs flex-1">
              {recorrencia.descricao}
              {recorrencia.proximaCompetencia && ` · próxima competência ${recorrencia.proximaCompetencia}`}
            </Text>
          </View>
        )}
        <View className="flex-row flex-wrap gap-2 mt-3">
          {!!pendencia.recorrencia_pai_id && <Badge label="Gerada pela recorrência" tone="blue" />}
          {!!pendencia.nivel_cobranca_atual && (
            <Badge label={NIVEL_LABEL[pendencia.nivel_cobranca_atual] ?? pendencia.nivel_cobranca_atual} tone="purple" />
          )}
          {!!pendencia.prioridade && (
            <Badge label={PRIORIDADE_LABEL[pendencia.prioridade]} tone={PRIORIDADE_TONE[pendencia.prioridade]} />
          )}
        </View>
      </View>

      {/* Cobrança automática — quem tem de enviar o documento é o cliente. */}
      {!!cobranca && (
        <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-4">
          <View className="flex-row items-center gap-2 mb-1.5">
            {pendencia.cobranca_automatica === false
              ? <BellOff size={14} color="#6b7280" />
              : <Megaphone size={14} color="#a78bfa" />}
            <Text className="text-white text-sm font-semibold flex-1">Cobrança automática</Text>
          </View>
          <Text className="text-gray-400 text-xs">{cobranca.resumo}</Text>
          <Text className="text-gray-600 text-[11px] mt-1">
            Enviada no WhatsApp de {pendencia.pendix_clientes?.nome ?? 'cliente'}
            {pendencia.pendix_clientes?.telefone ? ` (${pendencia.pendix_clientes.telefone})` : ''}.
          </Text>
          {!!cobranca.impedimento && (
            <Text className="text-yellow-500/90 text-[11px] mt-2 leading-4">⚠ {cobranca.impedimento}</Text>
          )}
          {pendencia.status === 'pendente' && (
            <Pressable
              onPress={() => alternarCobranca(pendencia.cobranca_automatica === false)}
              disabled={alternandoCobranca}
              className="border border-white/10 rounded-xl py-2.5 items-center mt-3"
              style={{ opacity: alternandoCobranca ? 0.6 : 1 }}
            >
              <Text className="text-gray-300 text-xs font-semibold">
                {pendencia.cobranca_automatica === false ? 'Ligar cobrança automática' : 'Desligar cobrança automática'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {pendencia.status === 'pendente' && (
        <Pressable
          onPress={marcarRecebido}
          disabled={updating}
          className="bg-purple-600 rounded-xl py-3 items-center mb-6"
          style={{ opacity: updating ? 0.6 : 1 }}
        >
          <Text className="text-white font-bold text-sm">
            {updating ? 'Atualizando...' : 'Marcar como recebido'}
          </Text>
        </Pressable>
      )}

      {/* Timeline */}
      <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Linha do tempo</Text>
      <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-4">
        {etapas.map((etapa, i) => (
          <View key={etapa.key} className="flex-row">
            <View className="items-center mr-3">
              <View
                style={{
                  width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: etapa.done ? 'rgba(167,139,250,0.20)' : 'rgba(255,255,255,0.04)',
                  borderWidth: 1, borderColor: etapa.done ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)',
                }}
              >
                {etapa.done ? <Check size={13} color="#a78bfa" /> : <etapa.icon size={13} color="#4b5563" />}
              </View>
              {i < etapas.length - 1 && (
                <View style={{ width: 1.5, flex: 1, minHeight: 24, backgroundColor: etapa.done ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.08)' }} />
              )}
            </View>
            <View className="flex-1 pb-4">
              <Text className={`text-sm ${etapa.done ? 'text-white font-semibold' : 'text-gray-600'}`}>{etapa.label}</Text>
              {!!etapa.data && <Text className="text-gray-500 text-[11px] mt-0.5">{formatDateTime(etapa.data)}</Text>}
            </View>
          </View>
        ))}
      </View>

      {/* Anexos */}
      <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Anexos</Text>
      <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-4 gap-2">
        {pendencia.arquivo_nome || pendencia.arquivo_modelo_nome ? (
          <>
            {!!pendencia.arquivo_nome && (
              <AnexoLinha
                nome={pendencia.arquivo_nome}
                path={pendencia.arquivo_url}
                legenda="Enviado pelo cliente"
              />
            )}
            {!!pendencia.arquivo_modelo_nome && (
              <AnexoLinha
                nome={pendencia.arquivo_modelo_nome}
                path={pendencia.arquivo_modelo_url}
                legenda="Modelo de exemplo"
              />
            )}
          </>
        ) : (
          <Text className="text-gray-600 text-sm">Nenhum anexo.</Text>
        )}
      </View>

      {/* Observações */}
      {(!!pendencia.descricao || !!pendencia.observacoes) && (
        <>
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Observações</Text>
          <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-4 gap-3">
            {!!pendencia.descricao && (
              <View>
                <Text className="text-gray-500 text-[10px] font-bold uppercase mb-1">Descrição</Text>
                <Text className="text-gray-300 text-sm leading-relaxed">{pendencia.descricao}</Text>
              </View>
            )}
            {!!pendencia.observacoes && (
              <View>
                <Text className="text-gray-500 text-[10px] font-bold uppercase mb-1">Interna</Text>
                <Text className="text-gray-300 text-sm leading-relaxed">{pendencia.observacoes}</Text>
              </View>
            )}
          </View>
        </>
      )}

      <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Conversa no WhatsApp</Text>
      {mensagens.length === 0 ? (
        <Text className="text-gray-600 text-sm">Nenhuma mensagem trocada ainda.</Text>
      ) : (
        <View className="gap-2.5">
          {mensagens.map((m) => (
            <View
              key={m.id}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${m.remetente === 'agente' ? 'bg-purple-600/25 self-start' : 'bg-white/[0.06] self-end'}`}
            >
              <Text className="text-white text-[13px] leading-5">{m.conteudo || (m.tipo === 'arquivo' ? '📎 Arquivo enviado' : '')}</Text>
              <Text className="text-gray-500 text-[10px] mt-1">{formatDateTime(m.criada_em)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
