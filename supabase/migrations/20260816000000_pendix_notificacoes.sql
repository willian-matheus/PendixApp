-- Fundação de notificações do Pendix (app + web).
--
-- Duas tabelas:
--   pendix_dispositivos — um registro por device/token de push de cada usuário.
--   pendix_notificacoes — o "ledger" de notificações: tanto as que o servidor
--     dispara quanto o estado de leitura/dispensa das notificações derivadas
--     que a tela já calcula em tempo real (getPendixNotificacoesDerivadas).
--
-- Sobre a materialização preguiçosa: hoje a central de notificações é derivada
-- de pendências + histórico e não tem linha no banco. Em vez de duplicar essa
-- derivação num cron, o app grava uma linha aqui só quando o usuário interage
-- (marca lida / dispensa), usando `chave_dedupe` = o id derivado. A mesma
-- tabela recebe as notificações reais criadas pela Edge Function depois.

-- ── pendix_dispositivos ─────────────────────────────────────────────────────

create table if not exists public.pendix_dispositivos (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references auth.users (id) on delete cascade,
  escritorio_id  uuid references public.empresas (id) on delete set null,

  -- Token do Expo Push Service (ExponentPushToken[...]). É o que a Edge
  -- Function usa para enviar. `device_push_token` guarda o token FCM/APNs cru
  -- só para diagnóstico — não é necessário para enviar via Expo.
  expo_push_token   text not null,
  device_push_token text,

  plataforma   text not null default 'android' check (plataforma in ('android', 'ios', 'web')),
  device_id    text,
  device_nome  text,
  app_version  text,

  ativo         boolean not null default true,
  ultimo_acesso timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Um token pertence a exatamente um device. Se outro usuário logar no mesmo
  -- aparelho, o upsert por token troca o usuario_id em vez de criar uma
  -- segunda linha — assim o device antigo para de receber push do usuário que
  -- saiu.
  constraint pendix_dispositivos_expo_push_token_key unique (expo_push_token)
);

create index if not exists pendix_dispositivos_usuario_ativo_idx
  on public.pendix_dispositivos (usuario_id) where ativo;

create index if not exists pendix_dispositivos_escritorio_idx
  on public.pendix_dispositivos (escritorio_id) where ativo;

alter table public.pendix_dispositivos enable row level security;

-- O usuário só enxerga e mexe nos próprios devices. Isso impede registrar um
-- token em nome de outra pessoa, que seria o caminho para receber push alheio.
drop policy if exists "pendix_dispositivos: select" on public.pendix_dispositivos;
create policy "pendix_dispositivos: select" on public.pendix_dispositivos
  for select to authenticated
  using (usuario_id = auth.uid() or pendix_is_admin());

drop policy if exists "pendix_dispositivos: insert" on public.pendix_dispositivos;
create policy "pendix_dispositivos: insert" on public.pendix_dispositivos
  for insert to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "pendix_dispositivos: update" on public.pendix_dispositivos;
create policy "pendix_dispositivos: update" on public.pendix_dispositivos
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

drop policy if exists "pendix_dispositivos: delete" on public.pendix_dispositivos;
create policy "pendix_dispositivos: delete" on public.pendix_dispositivos
  for delete to authenticated
  using (usuario_id = auth.uid() or pendix_is_admin());

-- ── pendix_notificacoes ─────────────────────────────────────────────────────

create table if not exists public.pendix_notificacoes (
  id            uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.empresas (id) on delete cascade,

  -- Destinatário. NULL = vale para o escritório inteiro (broadcast).
  usuario_id   uuid references auth.users (id) on delete cascade,
  pendencia_id uuid references public.pendix_pendencias (id) on delete cascade,
  cliente_id   uuid references public.pendix_clientes (id) on delete set null,

  tipo text not null check (tipo in (
    'vencida', 'proxima_vencimento', 'cliente_respondeu',
    'documento_recebido', 'nova_pendencia', 'teste'
  )),
  titulo   text not null,
  mensagem text not null default '',

  canal  text not null default 'push'
    check (canal in ('push', 'email', 'whatsapp', 'in_app')),
  status text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'entregue', 'falhou')),

  -- Payload que viaja no push e leva o app para a tela certa ao tocar.
  dados jsonb not null default '{}'::jsonb,

  -- Identidade estável da notificação, para não duplicar. Nas derivadas é o id
  -- calculado pelo app (ex.: 'vencida-<pendencia_id>').
  chave_dedupe text,

  enviado_em    timestamptz,
  lido_em       timestamptz,
  dispensado_em timestamptz,
  erro          text,
  created_at    timestamptz not null default now()
);

create unique index if not exists pendix_notificacoes_dedupe_idx
  on public.pendix_notificacoes (escritorio_id, usuario_id, chave_dedupe)
  where chave_dedupe is not null;

create index if not exists pendix_notificacoes_feed_idx
  on public.pendix_notificacoes (escritorio_id, created_at desc);

create index if not exists pendix_notificacoes_nao_lidas_idx
  on public.pendix_notificacoes (usuario_id) where lido_em is null;

alter table public.pendix_notificacoes enable row level security;

-- Rows com destinatário só aparecem para ele; rows sem destinatário aparecem
-- para todo o escritório. Admin vê tudo, como nas outras tabelas pendix_*.
drop policy if exists "pendix_notificacoes: select" on public.pendix_notificacoes;
create policy "pendix_notificacoes: select" on public.pendix_notificacoes
  for select to authenticated
  using (
    pendix_is_admin()
    or usuario_id = auth.uid()
    or (usuario_id is null and escritorio_id = pendix_current_escritorio_id())
  );

drop policy if exists "pendix_notificacoes: insert" on public.pendix_notificacoes;
create policy "pendix_notificacoes: insert" on public.pendix_notificacoes
  for insert to authenticated
  with check (
    pendix_is_admin()
    or (
      escritorio_id = pendix_current_escritorio_id()
      and (usuario_id is null or usuario_id = auth.uid())
    )
  );

-- Update existe para o app marcar lida/dispensada.
drop policy if exists "pendix_notificacoes: update" on public.pendix_notificacoes;
create policy "pendix_notificacoes: update" on public.pendix_notificacoes
  for update to authenticated
  using (
    pendix_is_admin()
    or usuario_id = auth.uid()
    or (usuario_id is null and escritorio_id = pendix_current_escritorio_id())
  )
  with check (
    pendix_is_admin()
    or usuario_id = auth.uid()
    or (usuario_id is null and escritorio_id = pendix_current_escritorio_id())
  );

drop policy if exists "pendix_notificacoes: delete" on public.pendix_notificacoes;
create policy "pendix_notificacoes: delete" on public.pendix_notificacoes
  for delete to authenticated
  using (pendix_is_admin() or usuario_id = auth.uid());
