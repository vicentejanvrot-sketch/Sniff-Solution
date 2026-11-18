-- Phase 3.5: free-tier due-publication wake-up.
-- This job remains inert until 'sniff_render_owner_key' is stored in Supabase Vault.
-- NEVER paste your key in a GitHub source file or SQL migration.
-- Add the existing Render PUBLISHING_OWNER_KEY into Supabase Vault with that exact name.
-- Requires pg_cron, pg_net, and pgcrypto enabled in the Supabase database.
select cron.schedule(
 'sniff-publishing-due-wake',
 '* * * * *',
 $job$
 do $wake$
 declare
  secret text;
  ts text := (extract(epoch from clock_timestamp())::bigint)::text;
 begin
  if not exists (
    select 1 from public.marketing_publish_jobs
    where status='scheduled' and scheduled_at <= now() + interval '5 minutes'
  ) then return; end if;
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name='sniff_render_owner_key' limit 1;
  if secret is null or length(secret)<32 then return; end if;
  perform net.http_post(
    url:='https://sniff-publishing.onrender.com/api/publishing/wake',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-sniff-timestamp',ts,
      'x-sniff-signature',encode(extensions.hmac(ts||'.{}',secret,'sha256'),'hex')
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=10000
  );
 end $wake$;
 $job$
);
-- Inspect: select jobid,jobname,active from cron.job where jobname='sniff-publishing-due-wake';
-- Stop without affecting publications: select cron.unschedule('sniff-publishing-due-wake');
