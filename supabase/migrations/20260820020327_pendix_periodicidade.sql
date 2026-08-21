-- Pendix — periodicidade (recorrência) da pendência.
--
-- Até aqui toda pendência era um evento único: "Extrato Bancário 2026-08" e
-- pronto. Documentos contábeis, porém, são quase todos recorrentes — o mesmo
-- extrato volta todo mês. `periodicidade` diz de quanto em quanto tempo a
-- pendência renasce.
--
-- A próxima ocorrência NÃO é pré-gerada: ela nasce quando a atual é marcada
-- como recebida (ver gerarProximaOcorrencia em services/pendix.ts). Assim a
-- lista de pendências nunca fica cheia de coisa do futuro, e mudar prazo ou
-- periodicidade no meio do caminho vale a partir do ciclo seguinte.
--
-- `recorrencia_pai_id` liga a ocorrência à que a originou. O índice ÚNICO
-- sobre ela é o que garante que ninguém gere duas sucessoras para a mesma
-- pendência — dois aparelhos marcando "recebido" ao mesmo tempo, ou um retry
-- de rede, esbarram no índice em vez de duplicar a cobrança do cliente.

alter table public.pendix_pendencias
  add column if not exists periodicidade text not null default 'unica',
  add column if not exists recorrencia_pai_id uuid
    references public.pendix_pendencias(id) on delete set null;

alter table public.pendix_pendencias drop constraint if exists pendix_pendencias_periodicidade_check;
alter table public.pendix_pendencias add constraint pendix_pendencias_periodicidade_check
  check (periodicidade in (
    'unica', 'semanal', 'quinzenal', 'mensal',
    'bimestral', 'trimestral', 'semestral', 'anual'
  ));

create unique index if not exists uniq_pendix_pendencias_recorrencia_pai
  on public.pendix_pendencias(recorrencia_pai_id)
  where recorrencia_pai_id is not null;

-- Usado pelo app para achar as recorrentes ainda abertas sem varrer a tabela.
create index if not exists idx_pendix_pendencias_periodicidade
  on public.pendix_pendencias(escritorio_id, periodicidade)
  where periodicidade <> 'unica';

comment on column public.pendix_pendencias.periodicidade is
  'De quanto em quanto tempo a pendência se repete. ''unica'' = evento único.';
comment on column public.pendix_pendencias.recorrencia_pai_id is
  'Pendência que originou esta ocorrência. Único: cada pendência gera no máximo uma sucessora.';
