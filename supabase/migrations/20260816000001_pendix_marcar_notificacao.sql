-- Marca uma notificação como lida/dispensada, criando a linha se ela ainda não
-- existir (as notificações derivadas só ganham linha quando o usuário interage).
--
-- Por que RPC em vez de upsert no client: o índice de dedupe é parcial
-- (`where chave_dedupe is not null`), e o PostgREST não consegue inferir um
-- índice parcial no ON CONFLICT — só em SQL cru dá para repetir o predicado.
--
-- O escritório vem de pendix_current_escritorio_id() (a tabela `usuarios`), e
-- nunca de um parâmetro vindo do app: o app deriva officeId do user_metadata
-- em alguns casos, e esse valor pode divergir do que a RLS enxerga.

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
  on conflict (escritorio_id, usuario_id, chave_dedupe) where chave_dedupe is not null
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
