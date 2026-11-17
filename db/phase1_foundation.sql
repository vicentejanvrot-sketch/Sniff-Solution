-- Single-owner developer workspace, accessed through the local trusted server only.
-- Paid multi-tenant access and application sign-in are intentionally not enabled.
create table public.marketing_workspaces (
  workspace_id text primary key check (workspace_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  revision bigint not null default 0 check (revision >= 0),
  document jsonb not null check (jsonb_typeof(document) = 'object' and document ->> 'version' = '1'),
  updated_at timestamptz not null default now()
);
alter table public.marketing_workspaces enable row level security;
revoke all on public.marketing_workspaces from public, anon, authenticated;
grant select, insert, update, delete on public.marketing_workspaces to service_role;
comment on table public.marketing_workspaces is
  'Single-owner Phase 1 snapshots with optimistic revision locking. Backend-only. No browser or anonymous access. Split into tenant-scoped entities before commercial multi-user release.';
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-media','marketing-media',false,104857600,
 array['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','video/mp4','audio/mpeg','audio/wav']);
-- No storage.objects policies are added. Private assets are mediated by the backend.
