-- Pendix — cobrança automática recorrente do CLIENTE.
--
-- Até aqui o agente falava com o cliente duas vezes: o primeiro contato e os
-- lembretes em até 3 datas digitadas à mão (`datas_notificacao`). Quem não
-- responde nenhuma das duas some do radar até alguém do escritório abrir a
-- pendência e cobrar manualmente.
--
-- Estas colunas ligam a cobrança em ritmo: o escritório escolhe a frequência
-- uma vez e o cron (send-whatsapp-pendentes) manda mensagem para o WhatsApp
-- do cliente nesse ritmo, subindo o tom conforme os prazos de
-- `pendix_configuracao_cobranca`, até o documento chegar (status sai de
-- 'pendente') ou o teto `max_reenvios` do escritório ser atingido.
--
--   cobranca_automatica  — liga/desliga por pendência
--   cobranca_frequencia  — de quanto em quanto tempo repete a cobrança
--   proxima_cobranca_em  — a data que o cron compara com "hoje"
--   cobrancas_enviadas   — quantas automáticas já saíram (contra max_reenvios)
--
-- O mesmo vocabulário de `periodicidade` é reaproveitado aqui de propósito:
-- é a lista que o usuário já conhece (ver lib/periodicidade.ts). Esta
-- migration também amplia esse vocabulário com diária, quadrimestral e bienal.

-- ── Vocabulário compartilhado ───────────────────────────────────────────────

alter table public.pendix_pendencias drop constraint if exists pendix_pendencias_periodicidade_check;
alter table public.pendix_pendencias add constraint pendix_pendencias_periodicidade_check
  check (periodicidade in (
    'unica', 'diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral',
    'trimestral', 'quadrimestral', 'semestral', 'anual', 'bienal'
  ));

-- ── Colunas da cobrança automática ──────────────────────────────────────────

alter table public.pendix_pendencias
  add column if not exists cobranca_automatica boolean not null default true,
  add column if not exists cobranca_frequencia text not null default 'semanal',
  add column if not exists proxima_cobranca_em date,
  add column if not exists cobrancas_enviadas integer not null default 0;

alter table public.pendix_pendencias drop constraint if exists pendix_pendencias_cobranca_frequencia_check;
alter table public.pendix_pendencias add constraint pendix_pendencias_cobranca_frequencia_check
  check (cobranca_frequencia in (
    'unica', 'diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral',
    'trimestral', 'quadrimestral', 'semestral', 'anual', 'bienal'
  ));

alter table public.pendix_pendencias drop constraint if exists pendix_pendencias_cobrancas_enviadas_check;
alter table public.pendix_pendencias add constraint pendix_pendencias_cobrancas_enviadas_check
  check (cobrancas_enviadas >= 0);

-- ── Pendências que já existem entram no ritmo sem susto ─────────────────────
-- `cobrancas_enviadas` herda `tentativas_reenvio` para o contato inicial já
-- enviado contar contra o teto, e a próxima cobrança fica agendada para o
-- início configurado, nunca antes de hoje (`greatest` com current_date) —
-- ligar a cobrança não pode virar um despejo de mensagens atrasadas.

-- `current_date` do Postgres e UTC: das 21h a meia-noite ele ja e amanha no
-- Brasil. O piso usa a data de Sao Paulo, a mesma que o cron compara.
update public.pendix_pendencias
   set cobrancas_enviadas = greatest(coalesce(tentativas_reenvio, 0), 0),
       proxima_cobranca_em = greatest(
         coalesce(data_inicio_cobranca, (now() at time zone 'America/Sao_Paulo')::date),
         (now() at time zone 'America/Sao_Paulo')::date
       )
 where status = 'pendente'
   and proxima_cobranca_em is null;

-- ── Índice da varredura do cron ─────────────────────────────────────────────
-- A cada 10 minutos o cron pergunta "quem vence hoje ou antes?". Sem isto ele
-- varre a tabela inteira toda vez.

create index if not exists idx_pendix_pendencias_proxima_cobranca
  on public.pendix_pendencias(proxima_cobranca_em)
  where status = 'pendente' and cobranca_automatica;

comment on column public.pendix_pendencias.cobranca_automatica is
  'Se o agente cobra o cliente sozinho, sem alguém apertar "Cobrar".';
comment on column public.pendix_pendencias.cobranca_frequencia is
  'De quanto em quanto tempo a cobrança se repete enquanto o documento não chega.';
comment on column public.pendix_pendencias.proxima_cobranca_em is
  'Data da próxima cobrança automática. NULL = não há próxima (teto atingido ou frequência única).';
comment on column public.pendix_pendencias.cobrancas_enviadas is
  'Quantas cobranças automáticas já saíram nesta pendência (conta contra max_reenvios do escritório).';
