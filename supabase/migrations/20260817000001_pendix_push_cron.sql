-- Agenda o disparo automático de push (Edge Function `notificar-pendencias`).
--
-- Mesmo padrão do job `send-whatsapp-pendentes`: pg_net + a anon key guardada
-- no vault. A service role NÃO entra aqui — quem precisa dela é a própria
-- Edge Function, que a lê do ambiente para chamar a `send-push`.
--
-- Horários em UTC; São Paulo é UTC-3.
--   prazos → 12:00 UTC = 09:00 BRT, uma vez por dia.
--   novas  → de 10 em 10 min, das 11:00 às 23:59 UTC = 08:00–20:59 BRT.
-- A faixa de horário existe para ninguém receber push de pendência às 3 da
-- manhã; o dedupe garante que nada se perde por ficar fora da janela — só
-- espera a próxima.

select cron.schedule(
  'pendix-push-prazos',
  '0 12 * * *',
  $cron$
  select net.http_post(
    url := 'https://ymakiqxrawpmklayqfam.supabase.co/functions/v1/notificar-pendencias',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'pendix_edge_function_anon_key'
      )
    ),
    body := '{"modo":"prazos"}'::jsonb
  );
  $cron$
);

select cron.schedule(
  'pendix-push-novas',
  '*/10 11-23 * * *',
  $cron$
  select net.http_post(
    url := 'https://ymakiqxrawpmklayqfam.supabase.co/functions/v1/notificar-pendencias',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'pendix_edge_function_anon_key'
      )
    ),
    body := '{"modo":"novas"}'::jsonb
  );
  $cron$
);
