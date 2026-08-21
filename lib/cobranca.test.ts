/**
 * Testes da cobrança automática — `npm test`.
 *
 * O que se testa aqui é a DECISÃO: dada uma pendência, as regras do escritório
 * e um instante, o agente cobra o cliente agora ou não, e o que fica agendado
 * depois. É a regra que o cron (send-whatsapp-pendentes) executa a cada 10 min.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decidirCobranca,
  inicioDaCobranca,
  dentroDaJanela,
  descreverCobranca,
  diffDias,
  horarioParaMinutos,
  montarMensagemCobranca,
  nivelCobranca,
  reagendarAposFalha,
  type Agora,
  type PendenciaCobravel,
  type RegrasCobranca,
} from './cobranca.ts';

// Padrões de `pendix_configuracao_cobranca` (ver CONFIG_COBRANCA_DEFAULT).
const REGRAS: RegrasCobranca = {
  dias_amigavel: 2, dias_lembrete: 7, dias_urgente: 15,
  horario_inicio: '08:00', horario_fim: '19:00',
  max_reenvios: 4, cooldown_horas: 24, ativo: true,
};

/** 19/08/2026, 09:30 no fuso do escritório. */
const AGORA: Agora = { data: '2026-08-19', minutos: 9 * 60 + 30, iso: '2026-08-19T12:30:00.000Z' };

const PENDENCIA: PendenciaCobravel = {
  status: 'pendente',
  cobranca_automatica: true,
  cobranca_frequencia: 'semanal',
  proxima_cobranca_em: '2026-08-19',
  cobrancas_enviadas: 0,
  horario_notificacao: '09:00:00',
  data_inicio_cobranca: '2026-08-19',
  ultima_mensagem_enviada_em: null,
  cliente: { telefone: '(11) 98888-7777', consentimento_whatsapp: true },
};

// ── Auxiliares ──────────────────────────────────────────────────────────────

test('horarioParaMinutos aceita HH:MM e o time do Postgres (HH:MM:SS)', () => {
  assert.equal(horarioParaMinutos('09:00'), 540);
  assert.equal(horarioParaMinutos('09:00:00'), 540);
  assert.equal(horarioParaMinutos('19:45'), 1185);
  assert.equal(horarioParaMinutos(null), 0);
});

test('diffDias conta dias corridos, inclusive virando o mês', () => {
  assert.equal(diffDias('2026-08-19', '2026-08-19'), 0);
  assert.equal(diffDias('2026-08-19', '2026-08-26'), 7);
  assert.equal(diffDias('2026-08-28', '2026-09-04'), 7);
  assert.equal(diffDias('2026-08-26', '2026-08-19'), -7);
});

test('dentroDaJanela cobre a janela normal e a que atravessa a meia-noite', () => {
  assert.equal(dentroDaJanela(9 * 60, '08:00', '19:00'), true);
  assert.equal(dentroDaJanela(7 * 60, '08:00', '19:00'), false);
  assert.equal(dentroDaJanela(20 * 60, '08:00', '19:00'), false);
  assert.equal(dentroDaJanela(23 * 60, '22:00', '06:00'), true);
  assert.equal(dentroDaJanela(2 * 60, '22:00', '06:00'), true);
  assert.equal(dentroDaJanela(12 * 60, '22:00', '06:00'), false);
});

// ── Nível ───────────────────────────────────────────────────────────────────

test('o tom sobe conforme os prazos do escritório', () => {
  assert.equal(nivelCobranca(0, REGRAS), 'amigavel');
  assert.equal(nivelCobranca(1, REGRAS), 'amigavel');
  assert.equal(nivelCobranca(2, REGRAS), 'lembrete');
  assert.equal(nivelCobranca(6, REGRAS), 'lembrete');
  assert.equal(nivelCobranca(7, REGRAS), 'urgente');
  assert.equal(nivelCobranca(14, REGRAS), 'urgente');
  assert.equal(nivelCobranca(15, REGRAS), 'critico');
  assert.equal(nivelCobranca(90, REGRAS), 'critico');
});

// ── Decisão: quando cobrar ──────────────────────────────────────────────────

test('caso feliz: cobra, agenda a próxima e conta a enviada', () => {
  const d = decidirCobranca(PENDENCIA, REGRAS, AGORA);
  assert.equal(d.cobrar, true);
  assert.equal(d.nivel, 'amigavel');
  assert.equal(d.cobrancas_enviadas, 1);
  assert.equal(d.proxima_cobranca_em, '2026-08-26'); // semanal
});

test('cada frequência agenda a próxima no passo certo', () => {
  const proxima = (cobranca_frequencia: string) =>
    decidirCobranca({ ...PENDENCIA, cobranca_frequencia }, REGRAS, AGORA).proxima_cobranca_em;

  assert.equal(proxima('diaria'), '2026-08-20');
  assert.equal(proxima('semanal'), '2026-08-26');
  assert.equal(proxima('quinzenal'), '2026-09-03');
  assert.equal(proxima('mensal'), '2026-09-19');
  assert.equal(proxima('bimestral'), '2026-10-19');
  assert.equal(proxima('trimestral'), '2026-11-19');
  assert.equal(proxima('quadrimestral'), '2026-12-19');
  assert.equal(proxima('semestral'), '2027-02-19');
  assert.equal(proxima('anual'), '2027-08-19');
  assert.equal(proxima('bienal'), '2028-08-19');
});

test('a próxima é ancorada no dia do ENVIO, não na data agendada', () => {
  // Cron fora do ar por um mês: a cobrança atrasada sai uma vez e o ritmo
  // recomeça de hoje, em vez de despejar 4 semanas de cobrança no cliente.
  const d = decidirCobranca({ ...PENDENCIA, proxima_cobranca_em: '2026-07-19' }, REGRAS, AGORA);
  assert.equal(d.cobrar, true);
  assert.equal(d.proxima_cobranca_em, '2026-08-26');
});

test('respeita a data agendada, o horário da pendência e a janela do escritório', () => {
  assert.equal(
    decidirCobranca({ ...PENDENCIA, proxima_cobranca_em: '2026-08-20' }, REGRAS, AGORA).motivo,
    'ainda_nao_e_dia',
  );
  assert.equal(
    decidirCobranca({ ...PENDENCIA, horario_notificacao: '14:00' }, REGRAS, AGORA).motivo,
    'antes_do_horario',
  );
  assert.equal(
    decidirCobranca(PENDENCIA, REGRAS, { ...AGORA, minutos: 21 * 60 }).motivo,
    'fora_da_janela',
  );
});

test('não cobra quem não deve ser cobrado', () => {
  const motivo = (p: Partial<PendenciaCobravel>, r: Partial<RegrasCobranca> = {}) =>
    decidirCobranca({ ...PENDENCIA, ...p }, { ...REGRAS, ...r }, AGORA).motivo;

  assert.equal(motivo({}, { ativo: false }), 'escritorio_desligado');
  assert.equal(motivo({ cobranca_automatica: false }), 'cobranca_desligada');
  assert.equal(motivo({ status: 'recebido' }), 'status_nao_pendente');
  assert.equal(motivo({ status: 'cancelado' }), 'status_nao_pendente');
  assert.equal(motivo({ cliente: { telefone: '', consentimento_whatsapp: true } }), 'sem_telefone');
  assert.equal(motivo({ cliente: null }), 'sem_telefone');
  assert.equal(motivo({ cliente: { telefone: '11988887777', consentimento_whatsapp: false } }), 'sem_consentimento');
  assert.equal(motivo({ cobrancas_enviadas: 4 }), 'limite_de_reenvios');
  assert.equal(motivo({ cobrancas_enviadas: 9 }), 'limite_de_reenvios');
});

test('consentimento nunca perguntado não bloqueia; só um "não" explícito bloqueia', () => {
  assert.equal(decidirCobranca({ ...PENDENCIA, cliente: { telefone: '11988887777' } }, REGRAS, AGORA).cobrar, true);
  assert.equal(
    decidirCobranca({ ...PENDENCIA, cliente: { telefone: '11988887777', consentimento_whatsapp: null } }, REGRAS, AGORA).cobrar,
    true,
  );
});

test('o cooldown impede duas cobranças coladas', () => {
  const tresHorasAtras = '2026-08-19T09:30:00.000Z';
  assert.equal(
    decidirCobranca({ ...PENDENCIA, ultima_mensagem_enviada_em: tresHorasAtras }, REGRAS, AGORA).motivo,
    'em_cooldown',
  );
  const doisDiasAtras = '2026-08-17T12:30:00.000Z';
  assert.equal(
    decidirCobranca({ ...PENDENCIA, ultima_mensagem_enviada_em: doisDiasAtras }, REGRAS, AGORA).cobrar,
    true,
  );
});

test('sem data marcada, a primeira cobrança cai no início configurado', () => {
  const semData = { ...PENDENCIA, proxima_cobranca_em: null };
  assert.equal(decidirCobranca({ ...semData, data_inicio_cobranca: '2026-09-01' }, REGRAS, AGORA).motivo, 'ainda_nao_e_dia');
  assert.equal(decidirCobranca({ ...semData, data_inicio_cobranca: '2026-08-01' }, REGRAS, AGORA).cobrar, true);
  assert.equal(decidirCobranca({ ...semData, data_inicio_cobranca: null }, REGRAS, AGORA).cobrar, true);
});

test('a última cobrança do teto não reagenda nada', () => {
  const d = decidirCobranca({ ...PENDENCIA, cobrancas_enviadas: 3 }, REGRAS, AGORA);
  assert.equal(d.cobrar, true);
  assert.equal(d.cobrancas_enviadas, 4);
  assert.equal(d.proxima_cobranca_em, null);
});

test('frequência "unica" cobra uma vez e não remarca', () => {
  const d = decidirCobranca({ ...PENDENCIA, cobranca_frequencia: 'unica' }, REGRAS, AGORA);
  assert.equal(d.cobrar, true);
  assert.equal(d.proxima_cobranca_em, null);
});

// ── A vida de uma pendência esquecida ───────────────────────────────────────

test('4 semanas sem resposta: o tom sobe e a cobrança para no teto', () => {
  let p: PendenciaCobravel = { ...PENDENCIA, ultima_mensagem_enviada_em: null };
  const niveis: string[] = [];
  const datas: string[] = [];

  // Roda o cron uma vez por dia por 40 dias, às 09:30.
  for (let dia = 0; dia < 40; dia++) {
    const data = new Date(Date.UTC(2026, 7, 19 + dia)).toISOString().slice(0, 10);
    const agora: Agora = { data, minutos: 9 * 60 + 30, iso: `${data}T12:30:00.000Z` };
    const d = decidirCobranca(p, REGRAS, agora);
    if (!d.cobrar) continue;
    niveis.push(d.nivel!);
    datas.push(data);
    p = {
      ...p,
      cobrancas_enviadas: d.cobrancas_enviadas,
      proxima_cobranca_em: d.proxima_cobranca_em,
      ultima_mensagem_enviada_em: agora.iso,
    };
  }

  assert.deepEqual(datas, ['2026-08-19', '2026-08-26', '2026-09-02', '2026-09-09']);
  // dias 0, 7, 14 e 21 em cobrança, contra os prazos 2/7/15 do escritório
  assert.deepEqual(niveis, ['amigavel', 'urgente', 'urgente', 'critico']);
  assert.equal(p.cobrancas_enviadas, REGRAS.max_reenvios);
  assert.equal(p.proxima_cobranca_em, null);

  // Depois do teto, o cron continua rodando e continua não cobrando.
  const depois = decidirCobranca(p, REGRAS, { data: '2026-10-01', minutos: 600, iso: '2026-10-01T13:00:00.000Z' });
  assert.equal(depois.cobrar, false);
  assert.equal(depois.motivo, 'limite_de_reenvios');
});

test('o documento chegando encerra a cobrança na hora', () => {
  const d = decidirCobranca({ ...PENDENCIA, status: 'recebido', cobrancas_enviadas: 1 }, REGRAS, AGORA);
  assert.equal(d.cobrar, false);
  assert.equal(d.motivo, 'status_nao_pendente');
});

test('envio que falha e adiado para amanha, sem consumir o teto', () => {
  assert.equal(reagendarAposFalha('2026-08-19'), '2026-08-20');
  assert.equal(reagendarAposFalha('2026-12-31'), '2027-01-01');
  assert.equal(reagendarAposFalha('2028-02-28'), '2028-02-29'); // bissexto
  assert.equal(reagendarAposFalha('nao e data'), null);

  // A pendencia adiada nao e reprocessada no mesmo dia — sem isso o cron
  // tentaria de novo a cada 10 minutos, para sempre.
  const falhou: PendenciaCobravel = {
    ...PENDENCIA,
    cobrancas_enviadas: 0, // a falha nao conta contra o teto
    proxima_cobranca_em: reagendarAposFalha(AGORA.data),
  };
  assert.equal(decidirCobranca(falhou, REGRAS, AGORA).motivo, 'ainda_nao_e_dia');
  assert.equal(
    decidirCobranca(falhou, REGRAS, { data: '2026-08-20', minutos: 10 * 60, iso: '2026-08-20T13:00:00.000Z' }).cobrar,
    true,
  );
});

// ── Mensagem e texto de UI ──────────────────────────────────────────────────

test('a mensagem fala com o cliente, nomeia o documento e sobe de tom', () => {
  const dados = { cliente: 'Maria', documento: 'Extrato Bancário', competencia: '2026-08', data_limite: '2026-08-20' };

  for (const nivel of ['amigavel', 'lembrete', 'urgente', 'critico'] as const) {
    const msg = montarMensagemCobranca(nivel, dados);
    assert.match(msg, /Maria/);
    assert.match(msg, /\*Extrato Bancário\* \(competência 2026-08\)/);
    assert.match(msg, /20\/08\/2026/);
  }

  assert.match(montarMensagemCobranca('amigavel', dados), /Pode enviar por aqui/);
  assert.match(montarMensagemCobranca('urgente', dados), /atrasado/);
  assert.match(montarMensagemCobranca('critico', dados), /multa/);
});

test('sem prazo cadastrado a mensagem não inventa data', () => {
  const msg = montarMensagemCobranca('lembrete', {
    cliente: 'João', documento: 'Nota Fiscal', competencia: '2026-08', data_limite: null,
  });
  assert.match(msg, /João/);
  assert.doesNotMatch(msg, /prazo/i);
});

test('descreverCobranca resume o estado para a tela', () => {
  assert.equal(
    descreverCobranca({ ...PENDENCIA, cobrancas_enviadas: 2, proxima_cobranca_em: '2026-09-05' }, 4),
    'Cobrando semanalmente · 2 de 4 enviadas · próxima em 05/09/2026',
  );
  assert.equal(descreverCobranca({ ...PENDENCIA, cobranca_automatica: false }), 'Cobrança automática desligada');
  assert.equal(
    descreverCobranca({ ...PENDENCIA, cobranca_frequencia: 'mensal', cobrancas_enviadas: 0, proxima_cobranca_em: null }),
    'Cobrando mensalmente',
  );
});

test('pendência que saiu de "pendente" não é anunciada como se ainda cobrasse', () => {
  // O cron para de cobrar assim que o status muda; dizer "Cobrando
  // semanalmente · próxima em 05/09" para um documento já recebido é mentira.
  assert.equal(
    descreverCobranca({ ...PENDENCIA, status: 'recebido', cobrancas_enviadas: 3, proxima_cobranca_em: '2026-09-05' }, 4),
    'Encerrada — 3 cobranças enviadas',
  );
  assert.equal(
    descreverCobranca({ ...PENDENCIA, status: 'recebido', cobrancas_enviadas: 1 }, 4),
    'Encerrada — 1 cobrança enviada',
  );
  assert.equal(
    descreverCobranca({ ...PENDENCIA, status: 'recebido', cobrancas_enviadas: 0 }, 4),
    'Encerrada — nenhuma cobrança foi necessária',
  );
  assert.equal(
    descreverCobranca({ ...PENDENCIA, status: 'cancelado', cobrancas_enviadas: 2 }, 4),
    'Encerrada — 2 cobranças enviadas',
  );
});

test('a ocorrência gerada não começa a cobrar antes da competência dela', () => {
  // Sem isto a sucessora nasceria com proxima_cobranca_em nulo, o cron leria
  // nulo como "cobrar agora" e o cliente levaria hoje a cobrança de setembro.
  assert.equal(inicioDaCobranca({ competencia: '2026-09' }), '2026-09-01');
  assert.equal(inicioDaCobranca({ competencia: '2026-09', data_inicio_cobranca: null }), '2026-09-01');
  assert.equal(inicioDaCobranca({ competencia: '2026-09', data_inicio_cobranca: '' }), '2026-09-01');
  // Data explícita manda: é o que o usuário configurou para o ciclo.
  assert.equal(inicioDaCobranca({ competencia: '2026-09', data_inicio_cobranca: '2026-09-10' }), '2026-09-10');
  assert.equal(inicioDaCobranca({ competencia: 'lixo' }), null);

  // E o resultado é aceito pela decisão: o ciclo de setembro não é cobrado hoje.
  const nova: PendenciaCobravel = {
    ...PENDENCIA,
    cobrancas_enviadas: 0,
    ultima_mensagem_enviada_em: null,
    data_inicio_cobranca: null,
    proxima_cobranca_em: inicioDaCobranca({ competencia: '2026-09' }),
  };
  assert.equal(decidirCobranca(nova, REGRAS, AGORA).motivo, 'ainda_nao_e_dia');
  // ...e é cobrado quando setembro chega.
  assert.equal(
    decidirCobranca(nova, REGRAS, { data: '2026-09-01', minutos: 10 * 60, iso: '2026-09-01T13:00:00.000Z' }).cobrar,
    true,
  );
});
