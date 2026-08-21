/**
 * A cópia das regras que roda no Deno tem de decidir igual à daqui.
 *
 * `lib/cobranca.ts` é a fonte da verdade, mas quem realmente cobra o cliente é
 * a Edge Function do PendixWeb, que carrega uma CÓPIA dessas funções (o Deno
 * não enxerga este repositório). Duas cópias divergem em silêncio — este teste
 * é o alarme: ele importa as duas e compara a decisão em centenas de cenários.
 *
 * Se o PendixWeb não estiver clonado ao lado, os testes são pulados em vez de
 * falharem — não dá para exigir o repositório vizinho de quem só mexe no app.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as app from './cobranca.ts';
import type { Agora, DecisaoCobranca, PendenciaCobravel, RegrasCobranca } from './cobranca.ts';
import { avancarData } from './periodicidade.ts';

const COPIA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../PendixWeb/supabase/functions/send-whatsapp-pendentes/cobranca.ts',
);

const disponivel = existsSync(COPIA);
const pular = { skip: disponivel ? false : `PendixWeb não encontrado em ${COPIA}` };

/** Só o que este teste compara — a cópia exporta um subconjunto do app. */
interface Copia {
  decidirCobranca(p: PendenciaCobravel, r: RegrasCobranca, agora: Agora): DecisaoCobranca;
  montarMensagemCobranca(nivel: 'amigavel' | 'lembrete' | 'urgente' | 'critico', d: app.DadosMensagem): string;
  avancarData(iso: string, p: string | null | undefined): string | null;
  reagendarAposFalha(hoje: string): string | null;
  REGRAS_PADRAO: RegrasCobranca;
}

// Sem o vizinho clonado os testes são pulados; o app entra só para o arquivo
// continuar typecheckando.
const deno: Copia = disponivel
  ? ((await import(pathToFileURL(COPIA).href)) as Copia)
  : { ...app, avancarData, REGRAS_PADRAO: app.REGRAS_COBRANCA_PADRAO };

const REGRAS: RegrasCobranca = {
  dias_amigavel: 2, dias_lembrete: 7, dias_urgente: 15,
  horario_inicio: '08:00', horario_fim: '19:00',
  max_reenvios: 4, cooldown_horas: 24, ativo: true,
};

test('as duas cópias decidem igual em toda a matriz de cenários', pular, () => {
  const frequencias = [
    'unica', 'diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral',
    'trimestral', 'quadrimestral', 'semestral', 'anual', 'bienal',
  ];
  const statuses = ['pendente', 'recebido', 'em_analise', 'cancelado'];
  const enviadas = [0, 1, 3, 4, 7];
  const datas = [null, '2026-07-19', '2026-08-19', '2026-09-30'];
  const horarios = ['08:00', '09:00:00', '18:30'];
  const clientes = [
    null,
    { telefone: '', consentimento_whatsapp: true },
    { telefone: '11988887777', consentimento_whatsapp: false },
    { telefone: '(11) 98888-7777', consentimento_whatsapp: true },
    { telefone: '11988887777' },
  ];
  const instantes: Agora[] = [
    { data: '2026-08-19', minutos: 7 * 60, iso: '2026-08-19T10:00:00.000Z' },
    { data: '2026-08-19', minutos: 9 * 60 + 30, iso: '2026-08-19T12:30:00.000Z' },
    { data: '2026-08-19', minutos: 20 * 60, iso: '2026-08-19T23:00:00.000Z' },
    { data: '2026-01-31', minutos: 12 * 60, iso: '2026-01-31T15:00:00.000Z' },
    { data: '2028-02-29', minutos: 12 * 60, iso: '2028-02-29T15:00:00.000Z' },
  ];

  let comparados = 0;
  let cobranças = 0;

  for (const cobranca_frequencia of frequencias) {
    for (const status of statuses) {
      for (const cobrancas_enviadas of enviadas) {
        for (const proxima_cobranca_em of datas) {
          for (const horario_notificacao of horarios) {
            for (const cliente of clientes) {
              for (const agora of instantes) {
                const p: PendenciaCobravel = {
                  status,
                  cobranca_automatica: true,
                  cobranca_frequencia,
                  proxima_cobranca_em,
                  cobrancas_enviadas,
                  horario_notificacao,
                  data_inicio_cobranca: '2026-08-01',
                  ultima_mensagem_enviada_em: cobrancas_enviadas > 0 ? '2026-08-15T12:00:00.000Z' : null,
                  cliente,
                };
                const a = app.decidirCobranca(p, REGRAS, agora);
                const b = deno.decidirCobranca(p, REGRAS, agora);
                try {
                  assert.deepEqual(b, a);
                } catch (err) {
                  // O diff do assert não diz QUAL cenário quebrou; sem isso
                  // sobra procurar agulha em 66 mil combinações.
                  (err as Error).message += `
cenário: ${JSON.stringify({ p, agora })}`;
                  throw err;
                }
                comparados++;
                if (a.cobrar) cobranças++;
              }
            }
          }
        }
      }
    }
  }

  // Uma matriz que nunca manda cobrar não provaria nada.
  assert.ok(comparados > 5000, `poucos cenários comparados: ${comparados}`);
  assert.ok(cobranças > 100, `poucos cenários de cobrança: ${cobranças}`);
});

test('as duas cópias partem do mesmo padrão de escritório', pular, () => {
  // Escritório sem linha em pendix_configuracao_cobranca cai no padrão. Se o
  // app e o cron discordassem aqui, a tela prometeria uma janela/teto que o
  // cron não respeita — e ninguém veria, porque nada quebra.
  assert.deepEqual(deno.REGRAS_PADRAO, app.REGRAS_COBRANCA_PADRAO);
});

test('as duas cópias escrevem a mesma mensagem', pular, () => {
  const dados = [
    { cliente: 'Maria', documento: 'Extrato Bancário', competencia: '2026-08', data_limite: '2026-08-20' },
    { cliente: 'João & Cia', documento: 'Nota Fiscal', competencia: '2026-12', data_limite: null },
  ];
  for (const d of dados) {
    for (const nivel of ['amigavel', 'lembrete', 'urgente', 'critico'] as const) {
      assert.equal(deno.montarMensagemCobranca(nivel, d), app.montarMensagemCobranca(nivel, d));
    }
  }
});

test('as duas cópias adiam um envio que falhou para o mesmo dia', pular, () => {
  for (const d of ['2026-08-19', '2026-12-31', '2028-02-28', '2026-02-28', 'lixo']) {
    assert.equal(deno.reagendarAposFalha(d), app.reagendarAposFalha(d), d);
  }
});

test('as duas cópias avançam datas igual, inclusive em fim de mês e bissexto', pular, () => {
  const datas = ['2026-01-31', '2026-02-28', '2028-02-29', '2026-04-30', '2026-08-15', '2026-12-31'];
  const frequencias = [
    'unica', 'diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral',
    'trimestral', 'quadrimestral', 'semestral', 'anual', 'bienal', 'lunar',
  ];
  for (const data of datas) {
    for (const f of frequencias) {
      assert.equal(deno.avancarData(data, f), avancarData(data, f), `${data} + ${f}`);
    }
  }
});
