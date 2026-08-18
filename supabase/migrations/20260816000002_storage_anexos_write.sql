-- Corrige upload de anexos, que estava quebrado em produção (site e app).
--
-- storage.objects tem RLS habilitada e existia APENAS a policy de SELECT
-- (`pendix_anexos: select scoped`). Sem INSERT, todo upload do cliente era
-- rejeitado — inclusive o de PendixPendencias.tsx, que chama
-- storage.from('pendix-anexos').upload(...) direto do browser.
--
-- O predicado espelha exatamente o da policy de SELECT já existente: o
-- primeiro nível do path tem que ser o escritório do próprio usuário. O
-- caminho gravado é `{escritorio_id}/{cliente_id}/{timestamp}-{nome}`, então
-- isso confina cada escritório à sua própria pasta.
--
-- UPDATE existe porque o site envia com `upsert: true`; sem ele, reenviar o
-- mesmo arquivo falharia.

drop policy if exists "pendix_anexos: insert scoped" on storage.objects;
create policy "pendix_anexos: insert scoped" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pendix-anexos'
    and (
      (storage.foldername(name))[1] = (pendix_current_escritorio_id())::text
      or pendix_is_admin()
    )
  );

drop policy if exists "pendix_anexos: update scoped" on storage.objects;
create policy "pendix_anexos: update scoped" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pendix-anexos'
    and (
      (storage.foldername(name))[1] = (pendix_current_escritorio_id())::text
      or pendix_is_admin()
    )
  )
  with check (
    bucket_id = 'pendix-anexos'
    and (
      (storage.foldername(name))[1] = (pendix_current_escritorio_id())::text
      or pendix_is_admin()
    )
  );
