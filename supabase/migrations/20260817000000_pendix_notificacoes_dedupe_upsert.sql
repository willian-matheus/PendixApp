-- Troca o índice de dedupe parcial por um equivalente não-parcial.
--
-- Motivo: a Edge Function `send-push` precisa fazer UPSERT no ledger. Quando
-- uma tentativa anterior falhou, a linha fica com status 'falhou' — ela não
-- bloqueia o dedupe (que só considera 'enviado'/'entregue'), mas colide no
-- índice único e derrubava o reenvio com "duplicate key". O PostgREST só
-- consegue inferir o ON CONFLICT a partir de um índice NÃO-parcial.
--
-- Semântica preservada: no Postgres, NULLs são distintos em índice único, então
-- linhas com `chave_dedupe` nulo continuam sem conflitar entre si — exatamente
-- o que o predicado `where chave_dedupe is not null` fazia.

create unique index if not exists pendix_notificacoes_dedupe_uidx
  on public.pendix_notificacoes (escritorio_id, usuario_id, chave_dedupe);

-- A RPC referenciava o índice parcial repetindo o predicado; sem ele, o
-- ON CONFLICT passa a inferir o índice novo.
create or replace function public.pendix_marcar_notificacao(
  p_chave        text,
  p_tipo         text,
  p_titulo       text,
  p_mensagem     text default '',
  p_pendencia_id uuid default null,
  p_cliente_id   uuid default null,
  p_lida         boolean default false,
  p_dispensada   boolean default false
) returns public.pendix_notificacoes
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_escritorio uuid := public.pendix_current_escritorio_id();
  v_usuario    uuid := auth.uid();
  v_row        public.pendix_notificacoes;
begin
  if v_usuario is null then
    raise exception 'pendix_marcar_notificacao: sem sessão autenticada';
  end if;

  if v_escritorio is null then
    raise exception 'pendix_marcar_notificacao: usuário % não tem escritorio_id em public.usuarios', v_usuario;
  end if;

  insert into public.pendix_notificacoes as n (
    escritorio_id, usuario_id, pendencia_id, cliente_id,
    tipo, titulo, mensagem, canal, status, chave_dedupe,
    lido_em, dispensado_em
  ) values (
    v_escritorio, v_usuario, p_pendencia_id, p_cliente_id,
    p_tipo, p_titulo, coalesce(p_mensagem, ''), 'in_app', 'entregue', p_chave,
    case when p_lida then now() end,
    case when p_dispensada then now() end
  )
  on conflict (escritorio_id, usuario_id, chave_dedupe)
  do update set
    -- coalesce: preserva o instante da primeira marcação em vez de reescrever.
    lido_em = case when p_lida then coalesce(n.lido_em, now()) else n.lido_em end,
    dispensado_em = case when p_dispensada then coalesce(n.dispensado_em, now()) else n.dispensado_em end
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.pendix_marcar_notificacao(text, text, text, text, uuid, uuid, boolean, boolean) from public;
grant execute on function public.pendix_marcar_notificacao(text, text, text, text, uuid, uuid, boolean, boolean) to authenticated;

drop index if exists public.pendix_notificacoes_dedupe_idx;
