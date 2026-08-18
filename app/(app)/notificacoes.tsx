import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, AlertTriangle, Clock, MessageCircle, FileCheck, Check, CheckCheck, X, CloudOff } from 'lucide-react-native';
import { getPendixNotificacoesDerivadas, type PendixNotificacaoDerivada, type PendixNotificacaoTipo } from '@/services/pendix';
import { getEstadosNotificacoes, marcarNotificacao, marcarTodasLidas } from '@/services/notificacoes';

const TIPO_CFG: Record<PendixNotificacaoTipo, { label: string; fg: string; bg: string; icon: any }> = {
  vencida: { label: 'Vencida', fg: '#f87171', bg: 'rgba(248,113,113,0.15)', icon: AlertTriangle },
  proxima_vencimento: { label: 'Próx. vencimento', fg: '#facc15', bg: 'rgba(250,204,21,0.15)', icon: Clock },
  cliente_respondeu: { label: 'Resposta', fg: '#60a5fa', bg: 'rgba(96,165,250,0.15)', icon: MessageCircle },
  documento_recebido: { label: 'Recebido', fg: '#34d399', bg: 'rgba(52,211,153,0.15)', icon: FileCheck },
};

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Ontem';
  return `${d} dias atrás`;
}

export default function NotificacoesScreen() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<PendixNotificacaoDerivada[]>([]);
  const [loading, setLoading] = useState(true);
  const [lidas, setLidas] = useState<Set<string>>(new Set());
  const [dispensadas, setDispensadas] = useState<Set<string>>(new Set());
  // Quando a gravação falha (ex.: usuário sem escritorio_id em `usuarios`), o
  // estado vira só-sessão. Melhor dizer isso do que fingir que persistiu.
  const [semPersistencia, setSemPersistencia] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelado = false;

    (async () => {
      try {
        const lista = await getPendixNotificacoesDerivadas();
        if (cancelado) return;
        setNotifs(lista);

        try {
          const estados = await getEstadosNotificacoes();
          if (cancelado) return;
          const novasLidas = new Set<string>();
          const novasDispensadas = new Set<string>();
          for (const [chave, estado] of estados) {
            if (estado.lido_em) novasLidas.add(chave);
            if (estado.dispensado_em) novasDispensadas.add(chave);
          }
          setLidas(novasLidas);
          setDispensadas(novasDispensadas);
          setSemPersistencia(false);
        } catch (err) {
          console.warn('[Notificações] Estado persistido indisponível:', err);
          if (!cancelado) setSemPersistencia(true);
        }
      } catch (err) {
        console.error('[Notificações] Falha:', err);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => { cancelado = true; };
  }, []));

  const visiveis = useMemo(() => notifs.filter((n) => !dispensadas.has(n.id)), [notifs, dispensadas]);
  const naoLidas = useMemo(() => visiveis.filter((n) => !lidas.has(n.id)), [visiveis, lidas]);
  const unread = naoLidas.length;

  async function markRead(n: PendixNotificacaoDerivada) {
    if (lidas.has(n.id)) return;
    setLidas((prev) => new Set(prev).add(n.id));
    try {
      await marcarNotificacao(n, { lida: true });
      setSemPersistencia(false);
    } catch (err) {
      console.warn('[Notificações] Não persistiu "lida":', n.id, err);
      setSemPersistencia(true);
    }
  }

  async function markAllRead() {
    const pendentes = naoLidas;
    setLidas(new Set(visiveis.map((n) => n.id)));
    try {
      await marcarTodasLidas(pendentes);
    } catch (err) {
      console.warn('[Notificações] Falha ao marcar todas:', err);
      setSemPersistencia(true);
    }
  }

  async function dismiss(n: PendixNotificacaoDerivada) {
    setDispensadas((prev) => new Set(prev).add(n.id));
    try {
      await marcarNotificacao(n, { lida: true, dispensada: true });
      setSemPersistencia(false);
    } catch (err) {
      console.warn('[Notificações] Não persistiu "dispensada":', n.id, err);
      setSemPersistencia(true);
    }
  }

  return (
    <View className="flex-1 bg-pendix-bg" style={{ paddingTop: 60 }}>
      <View className="flex-row items-center justify-between px-5 mb-4">
        <View>
          <Text className="text-xl font-bold text-white">Notificações</Text>
          <Text className="text-gray-500 text-xs mt-1">
            {loading ? 'Carregando…' : unread > 0 ? `${unread} não lida${unread > 1 ? 's' : ''}` : 'Tudo em dia'}
          </Text>
        </View>
        {unread > 0 && (
          <Pressable onPress={markAllRead} className="flex-row items-center gap-1.5 border border-white/10 rounded-xl px-3 py-2">
            <CheckCheck size={13} color="#9ca3af" />
            <Text className="text-gray-400 text-xs font-bold">Marcar lidas</Text>
          </Pressable>
        )}
      </View>

      {semPersistencia && (
        <View className="flex-row items-center gap-2 mx-5 mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <CloudOff size={13} color="#fbbf24" />
          <Text className="text-amber-400 text-[11px] flex-1">
            Não foi possível salvar no servidor — o que você marcar vale só nesta sessão.
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#a78bfa" style={{ marginTop: 40 }} />
      ) : visiveis.length === 0 ? (
        <View className="items-center mt-10">
          <Bell size={28} color="#374151" />
          <Text className="text-white text-base font-bold mt-4">Tudo em dia!</Text>
          <Text className="text-gray-600 text-sm mt-1">Você não tem notificações.</Text>
        </View>
      ) : (
        <FlatList
          data={visiveis}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 8 }}
          renderItem={({ item }) => {
            const cfg = TIPO_CFG[item.tipo];
            const Icon = cfg.icon;
            const lida = lidas.has(item.id);
            return (
              <Pressable
                onPress={() => {
                  void markRead(item);
                  if (item.pendencia_id) router.push(`/(app)/pendencias/${item.pendencia_id}`);
                }}
                className={`flex-row items-start gap-3 p-4 rounded-2xl border ${lida ? 'bg-white/[0.02] border-white/[0.04]' : 'bg-white/[0.05] border-white/10'}`}
              >
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: cfg.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={17} color={cfg.fg} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    {!lida && <View className="w-2 h-2 rounded-full bg-purple-500" />}
                    <Text className={`text-sm font-bold flex-1 ${lida ? 'text-gray-400' : 'text-white'}`} numberOfLines={1}>{item.titulo}</Text>
                    <Text className="text-gray-700 text-[10px]">{timeAgo(item.data)}</Text>
                  </View>
                  <Text className={`text-xs mt-0.5 ${lida ? 'text-gray-600' : 'text-gray-400'}`}>{item.descricao}</Text>
                  <View className="flex-row items-center gap-3 mt-2">
                    {!lida && (
                      <Pressable onPress={() => void markRead(item)} className="flex-row items-center gap-1">
                        <Check size={10} color="#34d399" />
                        <Text className="text-emerald-400 text-[10px] font-bold">Marcar lida</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => void dismiss(item)} className="flex-row items-center gap-1 ml-auto">
                      <X size={10} color="#6b7280" />
                      <Text className="text-gray-600 text-[10px] font-bold">Dispensar</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
