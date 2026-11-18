-- Durable one-time OAuth authorization requests, backend only.
create table public.marketing_oauth_states (
 state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
 workspace_id text not null check (workspace_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
 brand_id text not null,
 expected_username text not null,
 expires_at timestamptz not null default (now()+interval '10 minutes'),
 created_at timestamptz not null default now()
);
create index marketing_oauth_states_expiry_idx on public.marketing_oauth_states(expires_at);
alter table public.marketing_oauth_states enable row level security;
revoke all on public.marketing_oauth_states from public,anon,authenticated;
grant select,insert,delete on public.marketing_oauth_states to service_role;
create function public.marketing_consume_oauth_state(p_hash text)
returns setof public.marketing_oauth_states
language sql security invoker set search_path = ''
as $$
 delete from public.marketing_oauth_states where state_hash=p_hash and expires_at>now() returning *;
$$;
revoke all on function public.marketing_consume_oauth_state(text) from public,anon,authenticated;
grant execute on function public.marketing_consume_oauth_state(text) to service_role;
