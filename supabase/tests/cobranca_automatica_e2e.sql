-- Teste de ponta a ponta da cobrança automática, direto no banco.
--
-- Roda dentro de uma transação que termina em ROLLBACK: cria empresa, cliente
-- e pendências de mentira, confere tudo e não deixa nada gravado. Pode rodar
-- em produção. Precisa de service role (as fixtures ignoram RLS).
--
--   psql "$DATABASE_URL" -f supabase/tests/cobranca_automatica_e2e.sql
--
-- Pressupõe a migration 20260820024021_pendix_cobranca_automatica.sql aplicada.
-- A decisão de "cobrar ou não agora" é testada em lib/cobranca.test.ts
-- (`npm test`); aqui o que se testa é o contrato do schema e a consulta que o
-- cron usa para achar quem cobrar.

begin;

create temp table resultado(caso text, ok boolean, detalhe text);

do $$
declare
  v_emp uuid; v_cli uuid; v_p uuid; v_legado uuid;
  v_auto boolean; v_freq text; v_enviadas int; v_proxima date;
  v_aceitas int; v_achadas int; v_indice int;
  f text;
  -- Data de Sao Paulo, nao a UTC: e a mesma que a migration e o cron usam
  -- (`current_date` do Postgres vira amanha as 21h no Brasil).
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into public.empresas (nome) values ('__qa_cobranca__') returning id into v_emp;
  insert into public.pendix_clientes (escritorio_id, nome, responsavel, telefone, email)
    values (v_emp, '__qa_cliente__', 'QA', '11988887777', '') returning id into v_cli;

  -- 1) pendência criada sem dizer nada já nasce cobrando
  insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia)
    values (v_emp, v_cli, 'padrao', '2026-08')
    returning id, cobranca_automatica, cobranca_frequencia, cobrancas_enviadas
    into v_p, v_auto, v_freq, v_enviadas;
  insert into resultado values ('1. cobranca ligada por padrao, semanal, zerada',
    v_auto and v_freq = 'semanal' and v_enviadas = 0,
    format('auto=%s freq=%s enviadas=%s', v_auto, v_freq, v_enviadas));

  -- 2) as 11 frequências do vocabulário são aceitas
  v_aceitas := 0;
  foreach f in array array['unica','diaria','semanal','quinzenal','mensal','bimestral',
                           'trimestral','quadrimestral','semestral','anual','bienal'] loop
    begin
      update public.pendix_pendencias set cobranca_frequencia = f where id = v_p;
      v_aceitas := v_aceitas + 1;
    exception when check_violation then
      insert into resultado values ('2. frequencia recusada indevidamente', false, f);
    end;
  end loop;
  insert into resultado values ('2. as 11 frequencias sao aceitas', v_aceitas = 11, v_aceitas::text);

  -- 3) e nada fora dela
  begin
    update public.pendix_pendencias set cobranca_frequencia = 'lunar' where id = v_p;
    insert into resultado values ('3. check da frequencia', false, 'aceitou "lunar"');
  exception when check_violation then
    insert into resultado values ('3. check da frequencia', true, 'check_violation (23514)');
  end;

  -- 4) contador não pode ficar negativo
  begin
    update public.pendix_pendencias set cobrancas_enviadas = -1 where id = v_p;
    insert into resultado values ('4. contador nao fica negativo', false, 'aceitou -1');
  exception when check_violation then
    insert into resultado values ('4. contador nao fica negativo', true, 'check_violation (23514)');
  end;

  -- 5) a expressão do backfill nunca agenda no passado
  insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia,
      status, data_inicio_cobranca, tentativas_reenvio)
    values (v_emp, v_cli, 'legado', '2026-01', 'pendente', '2026-01-05', 2)
    returning id into v_legado;
  update public.pendix_pendencias
     set proxima_cobranca_em = greatest(coalesce(data_inicio_cobranca, v_hoje), v_hoje),
         cobrancas_enviadas = greatest(coalesce(tentativas_reenvio, 0), 0)
   where id = v_legado;
  select proxima_cobranca_em, cobrancas_enviadas into v_proxima, v_enviadas
    from public.pendix_pendencias where id = v_legado;
  insert into resultado values ('5. backfill agenda para hoje, nao para o passado',
    v_proxima = v_hoje and v_enviadas = 2,
    format('proxima=%s enviadas=%s', v_proxima, v_enviadas));

  -- 6) a consulta do cron acha quem tem de ser cobrado e ignora o resto
  update public.pendix_pendencias set status = 'pendente', cobranca_frequencia = 'semanal',
         proxima_cobranca_em = v_hoje where id = v_p;
  -- ruído: recebida, desligada e agendada para o futuro não podem aparecer
  insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia, status, proxima_cobranca_em)
    values (v_emp, v_cli, 'recebida', '2026-08', 'recebido', v_hoje);
  insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia, status, cobranca_automatica, proxima_cobranca_em)
    values (v_emp, v_cli, 'desligada', '2026-08', 'pendente', false, v_hoje);
  insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia, status, proxima_cobranca_em)
    values (v_emp, v_cli, 'futura', '2026-08', 'pendente', v_hoje + 30);
  -- e uma sem data marcada, que o cron trata como "cobrar agora"
  insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia, status, proxima_cobranca_em)
    values (v_emp, v_cli, 'sem data', '2026-08', 'pendente', null);

  select count(*) into v_achadas
    from public.pendix_pendencias
   where escritorio_id = v_emp
     and status = 'pendente'
     and cobranca_automatica
     and (proxima_cobranca_em is null or proxima_cobranca_em <= v_hoje);
  -- esperadas: a do caso 1, a do legado (caso 5) e a "sem data"
  insert into resultado values ('6. consulta do cron pega so quem deve', v_achadas = 3, v_achadas::text);

  -- 7) o índice parcial que essa consulta usa existe
  select count(*) into v_indice from pg_indexes
   where schemaname = 'public' and indexname = 'idx_pendix_pendencias_proxima_cobranca';
  insert into resultado values ('7. indice do cron existe', v_indice = 1, v_indice::text);
end $$;

select caso, ok, detalhe from resultado order by caso;

rollback;
