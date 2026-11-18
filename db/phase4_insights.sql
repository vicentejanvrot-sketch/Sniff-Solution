-- Additive server-only analytics cache. No tokens or personal workspace documents.
begin;
create table public.marketing_insights (
 workspace_id text not null,
 account_id uuid not null,
 brand_id text not null,
 revision integer not null default 0 check (revision >= 0),
 document jsonb not null default '{"snapshots":[],"warnings":[]}'::jsonb,
 last_attempt_at timestamptz,
 last_success_at timestamptz,
 next_sync_at timestamptz,
 last_error text,
 primary key (workspace_id,account_id),
 foreign key (workspace_id,brand_id,account_id) references public.marketing_instagram_accounts(workspace_id,brand_id,id)
);
alter table public.marketing_insights enable row level security;
revoke all on public.marketing_insights from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_insights to service_role;
commit;
