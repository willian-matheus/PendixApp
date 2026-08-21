-- Teste de ponta a ponta da periodicidade, direto no banco.
--
-- Roda dentro de uma transação que termina em ROLLBACK: cria empresa, cliente
-- e pendências de mentira, confere tudo e não deixa nada gravado. Pode rodar
-- em produção. Precisa de service role (as fixtures ignoram RLS).
--
--   psql "$DATABASE_URL" -f supabase/tests/periodicidade_e2e.sql
--
-- As datas da sucessora (caso 2) são exatamente o que lib/periodicidade.ts
-- calcula para a pendência do caso 2 — a aritmética em si é coberta por
-- lib/periodicidade.test.ts (`npm test`). Aqui o que se testa é o contrato do
-- schema: default, CHECK, índice único e o ON DELETE SET NULL.

begin;

create temp table resultado(caso text, ok boolean, detalhe text);

do $$
declare
  v_emp uuid; v_cli uuid; v_pai uuid; v_filho uuid; v_pai_apos uuid;
  v_default text; v_comp text; v_lim date; v_ini date;
  v_datas date[]; v_env date[]; v_sobrou int;
begin
  insert into public.empresas (nome) values ('__qa_periodicidade__') returning id into v_emp;
  insert into public.pendix_clientes (escritorio_id, nome, responsavel, telefone, email)
    values (v_emp, '__qa_cliente__', 'QA', '', '') returning id into v_cli;

  -- 1) pendência antiga / criada sem o campo continua sendo evento único
  insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia)
    values (v_emp, v_cli, 'sem periodicidade', '2026-01')
    returning periodicidade into v_default;
  insert into resultado values ('1. default e unica', v_default = 'unica', v_default);

  -- 2) pendência mensal, marcada como recebida (o gatilho da geração no app)
  insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia, status,
      data_limite, data_inicio_cobranca, datas_notificacao, datas_notificacao_enviadas, periodicidade)
    values (v_emp, v_cli, 'Extrato Bancario', '2026-01', 'pendente',
      '2026-01-31', '2026-01-05', array['2026-01-20','2026-01-27']::date[], array['2026-01-20']::date[], 'mensal')
    returning id into v_pai;
  update public.pendix_pendencias set status='recebido', data_recebimento=now() where id = v_pai;

  insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia, status,
      data_limite, data_inicio_cobranca, datas_notificacao, periodicidade, recorrencia_pai_id)
    values (v_emp, v_cli, 'Extrato Bancario', '2026-02', 'pendente',
      '2026-02-28', '2026-02-05', array['2026-02-20','2026-02-27']::date[], 'mensal', v_pai)
    returning id, competencia, data_limite, data_inicio_cobranca, datas_notificacao, datas_notificacao_enviadas
    into v_filho, v_comp, v_lim, v_ini, v_datas, v_env;

  insert into resultado values ('2. sucessora gravada com as datas avancadas',
    v_comp = '2026-02' and v_lim = '2026-02-28' and v_ini = '2026-02-05'
      and v_datas = array['2026-02-20','2026-02-27']::date[],
    v_comp || ' / venc ' || v_lim || ' / inicio ' || v_ini || ' / lembretes ' || v_datas::text);

  insert into resultado values ('3. ciclo novo comeca sem lembretes enviados', v_env = '{}'::date[], v_env::text);

  -- 4) dois aparelhos marcando "recebido" ao mesmo tempo não podem duplicar
  begin
    insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia, periodicidade, recorrencia_pai_id)
      values (v_emp, v_cli, 'Extrato Bancario', '2026-02', 'mensal', v_pai);
    insert into resultado values ('4. duplicata bloqueada', false, 'inseriu DUAS sucessoras');
  exception when unique_violation then
    insert into resultado values ('4. duplicata bloqueada', true, 'unique_violation (23505)');
  end;

  -- 5) valor fora da lista é recusado pelo banco
  begin
    insert into public.pendix_pendencias (escritorio_id, cliente_id, nome_documento, competencia, periodicidade)
      values (v_emp, v_cli, 'x', '2026-02', 'lunar');
    insert into resultado values ('5. check de periodicidade', false, 'aceitou "lunar"');
  exception when check_violation then
    insert into resultado values ('5. check de periodicidade', true, 'check_violation (23514)');
  end;

  -- 6) apagar a ocorrência antiga não leva a nova junto
  delete from public.pendix_pendencias where id = v_pai;
  select count(*) into v_sobrou from public.pendix_pendencias where id = v_filho;
  select recorrencia_pai_id into v_pai_apos from public.pendix_pendencias where id = v_filho;
  insert into resultado values ('6. apagar a anterior preserva a sucessora',
    v_sobrou = 1 and v_pai_apos is null, 'sobrou=' || v_sobrou || ', pai=' || coalesce(v_pai_apos::text, 'null'));
end $$;

select caso, ok, detalhe from resultado order by caso;

rollback;
