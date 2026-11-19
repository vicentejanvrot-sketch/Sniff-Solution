-- Additive private inbox. No access tokens or AI provider keys are stored here.
begin;
create table public.marketing_social_sync (
 workspace_id text not null,account_id uuid not null,brand_id text not null,
 kind text not null check(kind in ('research','inbox')),revision integer not null default 0,
 last_attempt_at timestamptz,last_success_at timestamptz,next_sync_at timestamptz,last_error text,
 primary key(workspace_id,account_id,kind),
 foreign key(workspace_id,brand_id,account_id) references public.marketing_instagram_accounts(workspace_id,brand_id,id)
);
create table public.marketing_inbox (
 workspace_id text not null,account_id uuid not null,brand_id text not null,id text not null,
 kind text not null check(kind in ('comment','dm')),source_id text not null,thread_id text not null,
 peer_id text not null,username text not null default '',text text not null,
 direction text not null check(direction in ('inbound','outbound')),received_at timestamptz not null,
 primary key(workspace_id,account_id,id),
 foreign key(workspace_id,brand_id,account_id) references public.marketing_instagram_accounts(workspace_id,brand_id,id)
);
create index marketing_inbox_recent on public.marketing_inbox(workspace_id,account_id,received_at desc);
create table public.marketing_inbox_replies (
 workspace_id text not null,account_id uuid not null,brand_id text not null,item_id text not null,
 text text not null check(length(text) between 1 and 1000),source_text text not null,
 version integer not null check(version>0),approved boolean not null default false,
 status text not null default 'draft' check(status in ('draft','sending','sent','uncertain')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),sent_at timestamptz,sent_id text,
 primary key(workspace_id,account_id,item_id),
 foreign key(workspace_id,account_id,item_id) references public.marketing_inbox(workspace_id,account_id,id),
 foreign key(workspace_id,brand_id,account_id) references public.marketing_instagram_accounts(workspace_id,brand_id,id)
);
alter table public.marketing_social_sync enable row level security;
alter table public.marketing_inbox enable row level security;
alter table public.marketing_inbox_replies enable row level security;
revoke all on public.marketing_social_sync,public.marketing_inbox,public.marketing_inbox_replies from public,anon,authenticated;
grant select,insert,update,delete on public.marketing_social_sync,public.marketing_inbox,public.marketing_inbox_replies to service_role;
commit;
