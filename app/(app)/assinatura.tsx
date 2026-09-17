import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Image, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  ChevronLeft, ShieldCheck, Clock, AlertTriangle, CreditCard, QrCode, Barcode,
  Copy, Check, ExternalLink, RefreshCw, Lock, Sparkles, Receipt, Download, FileText,
} from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import {
  getPlanos, getAssinatura, getPagamentos, gerarPixPlano, gerarBoletoPlano, consultarStatusPagamento,
  obterMercadoPagoPublicKey, tokenizarCartao, contratarPlanoCartao, simularPagamentoTeste,
  formatarValor, descreverCiclo, diasAteBloqueio, assinaturaEmDia,
  type PendixPlano, type PendixAssinatura, type PendixAssinaturaPagamento, type PixResult, type BoletoResult,
} from '@/services/assinatura';
import { baixarComprovantePdf } from '@/services/comprovante';
import { BottomSheetModal } from '@/components/Modal';
import { Badge, type BadgeTone } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Loader } from '@/components/Loader';

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function cpfMask(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function formatarNumeroCartao(v: string) {
  const limpo = v.replace(/\D/g, '').slice(0, 16);
  return limpo.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatarValidade(v: string) {
  const limpo = v.replace(/\D/g, '').slice(0, 4);
  if (limpo.length >= 3) {
    return `${limpo.slice(0, 2)}/${limpo.slice(2)}`;
  }
  return limpo;
}

function formatarCVV(v: string) {
  return v.replace(/\D/g, '').slice(0, 4);
}

function detectarBandeira(numero: string): { nome: string; cor: string } | null {
  const limpo = numero.replace(/\D/g, '');
  if (!limpo) return null;
  if (/^4/.test(limpo)) return { nome: 'Visa', cor: '#3b82f6' };
  if (/^(5[1-5]|2[2-7])/.test(limpo)) return { nome: 'Mastercard', cor: '#f97316' };
  if (/^(4011|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(limpo)) return { nome: 'Elo', cor: '#ef4444' };
  if (/^3[47]/.test(limpo)) return { nome: 'Amex', cor: '#06b6d4' };
  if (/^(606282|3841)/.test(limpo)) return { nome: 'Hipercard', cor: '#dc2626' };
  return null;
}

function avisoDoStatus(a: PendixAssinatura | null, dias: number | null) {
  if (!a || a.status === 'sem_assinatura') {
    return {
      tone: 'gray' as BadgeTone, icon: CreditCard,
      titulo: 'Escolha um plano para começar',
      texto: 'O acesso completo ao Pendix é liberado assim que o pagamento for confirmado.',
    };
  }
  if (a.status === 'pendente') {
    return {
      tone: 'yellow' as BadgeTone, icon: Clock,
      titulo: 'Aguardando a confirmação do pagamento',
      texto: 'Assim que o pagamento for confirmado pelo banco ou Mercado Pago, o acesso é liberado automaticamente.',
    };
  }
  if ((a.status === 'ativa' && dias !== null && dias < 0) || a.status === 'inadimplente' || a.status === 'bloqueada') {
    return {
      tone: 'red' as BadgeTone, icon: AlertTriangle,
      titulo: 'Sistema bloqueado por vencimento',
      texto: `O seu plano venceu em ${formatarData(a.vencimento_em)}. O acesso fica bloqueado até a realização do pagamento. Escolha uma forma abaixo para regularizar.`,
    };
  }
  if (a.status === 'ativa') {
    return {
      tone: 'green' as BadgeTone, icon: ShieldCheck,
      titulo: 'Assinatura ativa',
      texto: a.vencimento_em ? `Sua assinatura está em dia. Próximo vencimento em ${formatarData(a.vencimento_em)}.` : 'Sua assinatura está ativa e em dia.',
    };
  }
  if (a.status === 'pausada') {
    return {
      tone: 'yellow' as BadgeTone, icon: Clock,
      titulo: 'Assinatura pausada',
      texto: 'As cobranças estão suspensas. Realize um pagamento via Pix ou Boleto para reativar.',
    };
  }
  return {
    tone: 'red' as BadgeTone, icon: AlertTriangle,
    titulo: a.status === 'cancelada' ? 'Assinatura cancelada' : 'Assinatura bloqueada',
    texto: 'Contrate um plano para restabelecer o acesso à plataforma.',
  };
}

export default function AssinaturaScreen({ bloqueado = false }: { bloqueado?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();

  const [planos, setPlanos] = useState<PendixPlano[]>([]);
  const [assinatura, setAssinatura] = useState<PendixAssinatura | null>(null);
  const [pagamentos, setPagamentos] = useState<PendixAssinaturaPagamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const [planoEscolhido, setPlanoEscolhido] = useState<PendixPlano | null>(null);
  const [metodo, setMetodo] = useState<'cartao' | 'pix' | 'boleto'>('cartao');

  const [cartaoForm, setCartaoForm] = useState({
    numero: '',
    nome: user?.nome || '',
    validade: '',
    cvv: '',
    cpf: '',
  });
  const [assinandoCartao, setAssinandoCartao] = useState(false);

  const [comprovanteModal, setComprovanteModal] = useState<PendixAssinaturaPagamento | null>(null);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [simulando, setSimulando] = useState(false);

  const [gerandoPix, setGerandoPix] = useState(false);
  const [pixGerado, setPixGerado] = useState<PixResult | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);

  const [gerandoBoleto, setGerandoBoleto] = useState(false);
  const [boletoGerado, setBoletoGerado] = useState<BoletoResult | null>(null);
  const [boletoCopiado, setBoletoCopiado] = useState(false);
  const [boletoForm, setBoletoForm] = useState({ nome: user?.nome || '', cpf: '', email: user?.email || '' });

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [ps, a, pg] = await Promise.all([getPlanos(), getAssinatura(), getPagamentos()]);
      setPlanos(ps);
      setAssinatura(a);
      setPagamentos(pg);
    } catch (err) {
      console.error('[Assinatura] Falha ao carregar:', err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Verificação periódica do Pix enquanto estiver pendente na tela.
  useEffect(() => {
    if (!pixGerado?.payment_id) return;
    const checar = async () => {
      try {
        const res = await consultarStatusPagamento(pixGerado.payment_id);
        if (res.aprovado) {
          Alert.alert('Pagamento confirmado', 'O sistema foi desbloqueado.');
          setPixGerado(null);
          setPlanoEscolhido(null);
          await carregar();
        }
      } catch {
        // ignora erros pontuais de rede no polling
      }
    };
    pollingRef.current = setInterval(checar, 4000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [pixGerado, carregar]);

  const dias = diasAteBloqueio(assinatura);
  const aviso = avisoDoStatus(assinatura, dias);
  const emDia = assinaturaEmDia(assinatura);

  async function handleGerarPix(plano: PendixPlano) {
    setGerandoPix(true);
    try {
      const res = await gerarPixPlano(plano.codigo, { nome: user?.nome, email: user?.email });
      setPixGerado(res);
      await carregar();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao gerar Pix.');
    } finally {
      setGerandoPix(false);
    }
  }

  async function handleCopiarPix() {
    if (!pixGerado?.qr_code) return;
    await Clipboard.setStringAsync(pixGerado.qr_code);
    setPixCopiado(true);
    setTimeout(() => setPixCopiado(false), 3000);
  }

  async function handleGerarBoleto(plano: PendixPlano) {
    if (!boletoForm.nome.trim() || !boletoForm.cpf.trim() || !boletoForm.email.trim()) {
      Alert.alert('Faltam dados', 'Preencha seu nome completo, CPF e e-mail para emissão do boleto.');
      return;
    }
    const cpfLimpo = boletoForm.cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      Alert.alert('CPF inválido', 'Digite os 11 dígitos do CPF.');
      return;
    }
    setGerandoBoleto(true);
    try {
      const res = await gerarBoletoPlano(plano.codigo, { nome: boletoForm.nome.trim(), cpf: cpfLimpo, email: boletoForm.email.trim() });
      setBoletoGerado(res);
      await carregar();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao emitir boleto.');
    } finally {
      setGerandoBoleto(false);
    }
  }

  async function handleCopiarBoleto() {
    if (!boletoGerado?.barcode) return;
    await Clipboard.setStringAsync(boletoGerado.barcode);
    setBoletoCopiado(true);
    setTimeout(() => setBoletoCopiado(false), 3000);
  }

  async function handleBaixarComprovante(pg: PendixAssinaturaPagamento) {
    setBaixandoPdf(true);
    try {
      await baixarComprovantePdf({
        pagamento: pg,
        usuarioNome: user?.nome,
        usuarioEmail: user?.email,
      });
    } catch (err: any) {
      Alert.alert('Erro ao gerar comprovante', err.message || 'Não foi possível gerar o PDF.');
    } finally {
      setBaixandoPdf(false);
    }
  }

  async function handleSimularPagamentoTeste() {
    setSimulando(true);
    try {
      await simularPagamentoTeste('normal', 'cartao');
      Alert.alert('Pagamento simulado!', 'Um pagamento aprovado foi registrado no histórico para você testar o comprovante.');
      await carregar();
    } catch (err: any) {
      Alert.alert('Erro ao simular', err.message || 'Falha ao simular pagamento.');
    } finally {
      setSimulando(false);
    }
  }

  async function handleAssinarCartao(plano: PendixPlano) {
    const numLimpo = cartaoForm.numero.replace(/\D/g, '');
    if (numLimpo.length < 13 || numLimpo.length > 19) {
      Alert.alert('Cartão inválido', 'Digite o número completo do cartão.');
      return;
    }
    if (!cartaoForm.nome.trim()) {
      Alert.alert('Nome obrigatório', 'Digite o nome do titular como está impresso no cartão.');
      return;
    }
    const valLimpa = cartaoForm.validade.replace(/\D/g, '');
    if (valLimpa.length !== 4) {
      Alert.alert('Validade inválida', 'Digite o mês e ano de vencimento no formato MM/AA.');
      return;
    }
    const mes = parseInt(valLimpa.slice(0, 2), 10);
    const ano = 2000 + parseInt(valLimpa.slice(2, 4), 10);
    const agora = new Date();
    const anoAtual = agora.getFullYear();
    const mesAtual = agora.getMonth() + 1;
    if (mes < 1 || mes > 12) {
      Alert.alert('Mês inválido', 'O mês de validade deve ser entre 01 e 12.');
      return;
    }
    if (ano < anoAtual || (ano === anoAtual && mes < mesAtual)) {
      Alert.alert('Cartão vencido', 'A data de validade informada já expirou.');
      return;
    }
    if (cartaoForm.cvv.length < 3) {
      Alert.alert('CVV inválido', 'Digite o código de segurança (3 ou 4 dígitos).');
      return;
    }
    const cpfLimpo = cartaoForm.cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      Alert.alert('CPF inválido', 'Digite os 11 dígitos do CPF do titular do cartão.');
      return;
    }

    setAssinandoCartao(true);
    try {
      const publicKey = await obterMercadoPagoPublicKey();
      const cardTokenId = await tokenizarCartao(
        {
          numero: numLimpo,
          nomeTitular: cartaoForm.nome.trim(),
          mesExpiracao: mes,
          anoExpiracao: ano,
          codigoSeguranca: cartaoForm.cvv,
          cpfTitular: cpfLimpo,
        },
        publicKey,
      );

      await contratarPlanoCartao(plano.codigo, cardTokenId, {
        email: user?.email,
        nome: cartaoForm.nome.trim(),
        cpf: cpfLimpo,
      });

      Alert.alert(
        'Assinatura ativada!',
        'Sua assinatura no cartão de crédito foi autorizada com sucesso. Seu acesso está liberado!',
        [{ text: 'OK', onPress: () => setPlanoEscolhido(null) }],
      );
      await carregar();
    } catch (err: any) {
      Alert.alert('Falha no pagamento', err.message || 'Não foi possível processar o cartão. Verifique os dados e tente novamente.');
    } finally {
      setAssinandoCartao(false);
    }
  }

  if (carregando) {
    return (
      <View className="flex-1 bg-pendix-bg items-center justify-center">
        <Loader label="Carregando assinatura..." />
      </View>
    );
  }

  const AvisoIcon = aviso.icon;

  return (
    <View className="flex-1 bg-pendix-bg">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 48 }}>
      <View className="flex-row items-center gap-3 mb-6">
        {!bloqueado && (
          <Pressable onPress={() => router.back()} className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 items-center justify-center">
            <ChevronLeft size={16} color="#9ca3af" />
          </Pressable>
        )}
        <Text className="text-xl font-bold text-white flex-1">Assinatura</Text>
        <Pressable
          onPress={async () => { setAtualizando(true); await carregar(); setAtualizando(false); }}
          className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 items-center justify-center"
        >
          {atualizando ? <ActivityIndicator size="small" color="#a78bfa" /> : <RefreshCw size={15} color="#9ca3af" />}
        </Pressable>
      </View>

      <View className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 mb-6">
        <View className="flex-row items-center gap-2 mb-2">
          <AvisoIcon size={16} color={aviso.tone === 'red' ? '#f87171' : aviso.tone === 'green' ? '#34d399' : aviso.tone === 'yellow' ? '#facc15' : '#9ca3af'} />
          <Text className="text-white font-bold text-sm">{aviso.titulo}</Text>
        </View>
        <Text className="text-gray-400 text-xs leading-relaxed mb-3">{aviso.texto}</Text>
        <Badge label={assinatura?.status ?? 'sem_assinatura'} tone={aviso.tone} />
      </View>

      {/* Histórico de pagamentos e comprovantes */}
      <View className="mb-6">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Histórico de pagamentos</Text>
          <Pressable
            onPress={handleSimularPagamentoTeste}
            disabled={simulando}
            className="flex-row items-center gap-1 bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/20 active:bg-purple-500/20"
          >
            {simulando ? <ActivityIndicator size="small" color="#c4b5fd" /> : <Receipt size={11} color="#c4b5fd" />}
            <Text className="text-purple-300 text-[10px] font-bold">Simular teste</Text>
          </Pressable>
        </View>

        {pagamentos.length > 0 ? (
          pagamentos.slice(0, 5).map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setComprovanteModal(p)}
              className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-2 flex-row items-center justify-between active:bg-white/[0.06]"
            >
              <View className="flex-1 pr-2">
                <View className="flex-row items-center gap-1.5 mb-0.5">
                  <Receipt size={13} color="#a78bfa" />
                  <Text className="text-gray-200 text-xs font-semibold">{p.payload?.plano_nome || 'Assinatura Pendix'}</Text>
                </View>
                <Text className="text-gray-500 text-[11px]">
                  {formatarData(p.pago_em ?? p.created_at)} · {formatarValor(p.valor_centavos)}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Badge label={p.status === 'approved' ? 'pago' : p.status} tone={p.status === 'approved' ? 'green' : 'gray'} />
                <View className="w-8 h-8 rounded-lg bg-purple-500/10 items-center justify-center border border-purple-500/20">
                  <Download size={13} color="#c4b5fd" />
                </View>
              </View>
            </Pressable>
          ))
        ) : (
          <View className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-4 items-center justify-center">
            <Receipt size={22} color="#4b5563" style={{ marginBottom: 6 }} />
            <Text className="text-gray-400 text-xs font-semibold">Nenhum pagamento registrado</Text>
            <Text className="text-gray-600 text-[11px] text-center mt-1">
              Ao realizar um pagamento ou clicar em "Simular teste", os comprovantes ficarão disponíveis aqui para download em PDF.
            </Text>
          </View>
        )}
      </View>

      {!emDia && (
        <View>
          <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-3">Planos disponíveis</Text>
          {planos.map((plano) => {
            const aberto = planoEscolhido?.id === plano.id;
            return (
              <View key={plano.id} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-3">
                <Pressable onPress={() => { setPlanoEscolhido(aberto ? null : plano); setPixGerado(null); setBoletoGerado(null); }}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-2">
                      <Text className="text-white font-bold text-sm">{plano.nome}</Text>
                      <Text className="text-gray-500 text-xs mt-0.5">{plano.descricao}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-purple-300 font-black text-base">{formatarValor(plano.valor_centavos)}</Text>
                      <Text className="text-gray-600 text-[10px]">{descreverCiclo(plano)}</Text>
                    </View>
                  </View>
                </Pressable>

                {aberto && (
                  <View className="mt-4 pt-4 border-t border-white/[0.06]">
                    <View className="flex-row gap-2 mb-4">
                      <Pressable
                        onPress={() => setMetodo('cartao')}
                        className={`flex-1 items-center py-2.5 rounded-xl border flex-row justify-center gap-1.5 ${metodo === 'cartao' ? 'bg-purple-500/15 border-purple-500/40' : 'border-white/10'}`}
                      >
                        <CreditCard size={14} color={metodo === 'cartao' ? '#c4b5fd' : '#6b7280'} />
                        <Text className={metodo === 'cartao' ? 'text-purple-300 font-bold text-xs' : 'text-gray-500 text-xs'}>Cartão</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setMetodo('pix')}
                        className={`flex-1 items-center py-2.5 rounded-xl border flex-row justify-center gap-1.5 ${metodo === 'pix' ? 'bg-purple-500/15 border-purple-500/40' : 'border-white/10'}`}
                      >
                        <QrCode size={14} color={metodo === 'pix' ? '#c4b5fd' : '#6b7280'} />
                        <Text className={metodo === 'pix' ? 'text-purple-300 font-bold text-xs' : 'text-gray-500 text-xs'}>Pix</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setMetodo('boleto')}
                        className={`flex-1 items-center py-2.5 rounded-xl border flex-row justify-center gap-1.5 ${metodo === 'boleto' ? 'bg-purple-500/15 border-purple-500/40' : 'border-white/10'}`}
                      >
                        <Barcode size={14} color={metodo === 'boleto' ? '#c4b5fd' : '#6b7280'} />
                        <Text className={metodo === 'boleto' ? 'text-purple-300 font-bold text-xs' : 'text-gray-500 text-xs'}>Boleto</Text>
                      </Pressable>
                    </View>

                    {metodo === 'cartao' && (() => {
                      const bandeira = detectarBandeira(cartaoForm.numero);
                      return (
                        <View>
                          <View className="bg-purple-950/30 border border-purple-500/20 rounded-xl p-3 mb-4 flex-row items-start gap-2.5">
                            <Sparkles size={16} color="#c4b5fd" style={{ marginTop: 2 }} />
                            <View className="flex-1">
                              <Text className="text-purple-200 text-xs font-semibold">Assinatura mensal recorrente</Text>
                              <Text className="text-purple-300/70 text-[11px] leading-relaxed mt-0.5">
                                Cobrança automática no cartão de crédito. Liberação imediata da sua conta.
                              </Text>
                            </View>
                          </View>

                          <View className="mb-3">
                            <View className="flex-row items-center justify-between mb-1.5">
                              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Número do Cartão</Text>
                              {!!bandeira && (
                                <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: `${bandeira.cor}22`, borderWidth: 1, borderColor: `${bandeira.cor}44` }}>
                                  <Text style={{ color: bandeira.cor, fontSize: 10, fontWeight: '700' }}>{bandeira.nome}</Text>
                                </View>
                              )}
                            </View>
                            <TextInput
                              value={cartaoForm.numero}
                              onChangeText={(v) => setCartaoForm((f) => ({ ...f, numero: formatarNumeroCartao(v) }))}
                              placeholder="0000 0000 0000 0000"
                              placeholderTextColor="#4b5563"
                              keyboardType="numeric"
                              maxLength={19}
                              className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm"
                            />
                          </View>

                          <View className="mb-3">
                            <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Nome no Cartão</Text>
                            <TextInput
                              value={cartaoForm.nome}
                              onChangeText={(v) => setCartaoForm((f) => ({ ...f, nome: v.toUpperCase() }))}
                              placeholder="Como impresso no cartão"
                              placeholderTextColor="#4b5563"
                              autoCapitalize="characters"
                              className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm"
                            />
                          </View>

                          <View className="flex-row gap-3 mb-3">
                            <View className="flex-1">
                              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Validade</Text>
                              <TextInput
                                value={cartaoForm.validade}
                                onChangeText={(v) => setCartaoForm((f) => ({ ...f, validade: formatarValidade(v) }))}
                                placeholder="MM/AA"
                                placeholderTextColor="#4b5563"
                                keyboardType="numeric"
                                maxLength={5}
                                className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm text-center"
                              />
                            </View>

                            <View className="flex-1">
                              <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">CVV</Text>
                              <TextInput
                                value={cartaoForm.cvv}
                                onChangeText={(v) => setCartaoForm((f) => ({ ...f, cvv: formatarCVV(v) }))}
                                placeholder="123"
                                placeholderTextColor="#4b5563"
                                keyboardType="numeric"
                                maxLength={4}
                                secureTextEntry
                                className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm text-center"
                              />
                            </View>
                          </View>

                          <View className="mb-4">
                            <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">CPF do Titular</Text>
                            <TextInput
                              value={cartaoForm.cpf}
                              onChangeText={(v) => setCartaoForm((f) => ({ ...f, cpf: cpfMask(v) }))}
                              placeholder="000.000.000-00"
                              placeholderTextColor="#4b5563"
                              keyboardType="numeric"
                              maxLength={14}
                              className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm"
                            />
                          </View>

                          <Button
                            label={assinandoCartao ? 'Processando...' : `Assinar por ${formatarValor(plano.valor_centavos)}/mês`}
                            icon={CreditCard}
                            onPress={() => handleAssinarCartao(plano)}
                            loading={assinandoCartao}
                          />

                          <View className="flex-row items-center justify-center gap-1.5 mt-3">
                            <Lock size={11} color="#6b7280" />
                            <Text className="text-gray-500 text-[11px]">Pagamento 100% criptografado e seguro</Text>
                          </View>
                        </View>
                      );
                    })()}

                    {metodo === 'pix' && (
                      <View>
                        {!pixGerado ? (
                          <Button label={gerandoPix ? 'Gerando...' : 'Gerar Pix'} icon={QrCode} onPress={() => handleGerarPix(plano)} loading={gerandoPix} />
                        ) : (
                          <View className="items-center">
                            {!!pixGerado.qr_code_base64 && (
                              <Image
                                source={{ uri: `data:image/png;base64,${pixGerado.qr_code_base64}` }}
                                style={{ width: 180, height: 180, borderRadius: 12, marginBottom: 12, backgroundColor: '#fff' }}
                              />
                            )}
                            <Pressable
                              onPress={handleCopiarPix}
                              className="flex-row items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 mb-2 w-full justify-center"
                            >
                              {pixCopiado ? <Check size={14} color="#34d399" /> : <Copy size={14} color="#9ca3af" />}
                              <Text className="text-gray-200 text-xs font-semibold">{pixCopiado ? 'Copiado!' : 'Copiar código Pix Copia e Cola'}</Text>
                            </Pressable>
                            <Text className="text-gray-600 text-[11px] text-center mt-1">Aguardando confirmação do pagamento...</Text>
                            <ActivityIndicator size="small" color="#a78bfa" style={{ marginTop: 8 }} />
                          </View>
                        )}
                      </View>
                    )}

                    {metodo === 'boleto' && (
                      <View>
                        {!boletoGerado ? (
                          <View>
                            <TextInput
                              value={boletoForm.nome} onChangeText={(v) => setBoletoForm((f) => ({ ...f, nome: v }))}
                              placeholder="Nome completo" placeholderTextColor="#4b5563"
                              className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-3"
                            />
                            <TextInput
                              value={boletoForm.cpf} onChangeText={(v) => setBoletoForm((f) => ({ ...f, cpf: cpfMask(v) }))}
                              placeholder="CPF" placeholderTextColor="#4b5563" keyboardType="numeric"
                              className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-3"
                            />
                            <TextInput
                              value={boletoForm.email} onChangeText={(v) => setBoletoForm((f) => ({ ...f, email: v }))}
                              placeholder="E-mail" placeholderTextColor="#4b5563" autoCapitalize="none" keyboardType="email-address"
                              className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-4"
                            />
                            <Button label={gerandoBoleto ? 'Emitindo...' : 'Emitir boleto'} icon={Barcode} onPress={() => handleGerarBoleto(plano)} loading={gerandoBoleto} />
                          </View>
                        ) : (
                          <View>
                            <Pressable
                              onPress={handleCopiarBoleto}
                              className="flex-row items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 mb-2 justify-center"
                            >
                              {boletoCopiado ? <Check size={14} color="#34d399" /> : <Copy size={14} color="#9ca3af" />}
                              <Text className="text-gray-200 text-xs font-semibold" numberOfLines={1}>
                                {boletoCopiado ? 'Copiado!' : `Copiar linha digitável (${boletoGerado.barcode.slice(0, 12)}...)`}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => Linking.openURL(boletoGerado.ticket_url)}
                              className="flex-row items-center gap-2 bg-purple-600 rounded-xl px-4 py-3 justify-center"
                            >
                              <ExternalLink size={14} color="#fff" />
                              <Text className="text-white text-xs font-bold">Abrir boleto em PDF</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          {planos.length === 0 && <Text className="text-gray-600 text-xs">Nenhum plano disponível no momento.</Text>}
        </View>
      )}
      </ScrollView>

      {/* Modal de Comprovante de Pagamento */}
      <BottomSheetModal
        visible={!!comprovanteModal}
        onClose={() => setComprovanteModal(null)}
        title="Comprovante de Pagamento"
      >
        {!!comprovanteModal && (
          <View>
            <View className="items-center bg-white/[0.03] border border-white/10 rounded-2xl p-5 mb-5">
              <View className="w-12 h-12 rounded-full bg-purple-500/20 items-center justify-center border border-purple-500/30 mb-3">
                <Receipt size={22} color="#c4b5fd" />
              </View>
              <Text className="text-gray-400 text-xs uppercase tracking-wide font-bold mb-1">Valor Pago</Text>
              <Text className="text-white font-black text-3xl mb-2">{formatarValor(comprovanteModal.valor_centavos)}</Text>
              <Badge
                label={comprovanteModal.status === 'approved' ? 'PAGAMENTO CONFIRMADO' : comprovanteModal.status.toUpperCase()}
                tone={comprovanteModal.status === 'approved' ? 'green' : 'yellow'}
              />
            </View>

            <View className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-5">
              <View className="flex-row justify-between py-2 border-b border-white/[0.04]">
                <Text className="text-gray-500 text-xs">Serviço / Plano:</Text>
                <Text className="text-gray-200 text-xs font-bold">{comprovanteModal.payload?.plano_nome || 'Assinatura Pendix'}</Text>
              </View>
              <View className="flex-row justify-between py-2 border-b border-white/[0.04]">
                <Text className="text-gray-500 text-xs">Forma de Pagamento:</Text>
                <Text className="text-gray-200 text-xs font-bold capitalize">
                  {comprovanteModal.payload?.metodo === 'cartao' ? 'Cartão de Crédito' : (comprovanteModal.payload?.metodo || 'Mercado Pago')}
                </Text>
              </View>
              <View className="flex-row justify-between py-2 border-b border-white/[0.04]">
                <Text className="text-gray-500 text-xs">Data:</Text>
                <Text className="text-gray-200 text-xs">{formatarData(comprovanteModal.pago_em ?? comprovanteModal.created_at)}</Text>
              </View>
              <View className="flex-row justify-between py-2">
                <Text className="text-gray-500 text-xs">ID da Transação:</Text>
                <Text className="text-purple-300 text-xs font-mono font-bold">#{comprovanteModal.mp_payment_id}</Text>
              </View>
            </View>

            <View className="gap-2.5">
              <Button
                label={baixandoPdf ? 'Gerando PDF...' : 'Baixar Comprovante (PDF)'}
                icon={Download}
                onPress={() => handleBaixarComprovante(comprovanteModal)}
                loading={baixandoPdf}
              />

              {!!comprovanteModal.payload?.ticket_url && (
                <Pressable
                  onPress={() => {
                    const url = comprovanteModal.payload?.ticket_url;
                    if (url) Linking.openURL(url);
                  }}
                  className="flex-row items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 justify-center"
                >
                  <ExternalLink size={14} color="#9ca3af" />
                  <Text className="text-gray-200 text-xs font-semibold">Abrir Recibo no Mercado Pago</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </BottomSheetModal>
    </View>
  );
}
