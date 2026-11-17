-- Phase 3 additive, backend-only publishing foundation.
-- No changes to Phase 1/2 tables or storage visibility.
begin;
create table public.marketing_instagram_accounts (
 id uuid primary key default gen_random_uuid(),
 workspace_id text not null check (workspace_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
 brand_id text not null,
 instagram_user_id text not null,
 username text not null,
 status text not null default 'disconnected' check (status in ('connected','disconnected','expired')),
 token_ciphertext text,
 token_expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workspace_id,brand_id,instagram_user_id),
 unique(workspace_id,brand_id,id),
 check (status <> 'connected' or token_ciphertext is not null)
);
create table public.marketing_publish_jobs (
 id uuid primary key default gen_random_uuid(),
 workspace_id text not null,
 brand_id text not null,
 account_id uuid not null,
 asset_id text not null,
 asset_version integer not null check (asset_version > 0),
 storage_path text not null,
 format text not null check (format in ('image','reel')),
 caption text not null default '' check (char_length(caption)<=2200),
 scheduled_at timestamptz not null,
 time_zone text not null,
 status text not null default 'scheduled' check (status in ('scheduled','queued','publishing','published','failed','cancelled','needs_reconciliation')),
 attempts integer not null default 0 check (attempts>=0),
 container_id text,
 instagram_media_id text,
 last_error text,
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,brand_id,account_id) references public.marketing_instagram_accounts(workspace_id,brand_id,id),
 check (status <> 'published' or (instagram_media_id is not null and published_at is not null))
);
create index marketing_publish_due_idx on public.marketing_publish_jobs(scheduled_at,id) where status in ('scheduled','queued');
create table public.marketing_publish_events (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.marketing_publish_jobs(id),
 event_type text not null,
 detail text,
 created_at timestamptz not null default now()
);
create index marketing_publish_events_job_idx on public.marketing_publish_events(job_id,created_at);
alter table public.marketing_instagram_accounts enable row level security;
alter table public.marketing_publish_jobs enable row level security;
alter table public.marketing_publish_events enable row level security;
revoke all on public.marketing_instagram_accounts, public.marketing_publish_jobs, public.marketing_publish_events from public, anon, authenticated;
grant select,insert,update,delete on public.marketing_instagram_accounts,public.marketing_publish_jobs to service_role;
grant select,insert on public.marketing_publish_events to service_role;
commit;
