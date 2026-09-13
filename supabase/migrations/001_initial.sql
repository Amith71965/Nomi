-- Nomi initial schema. Apply once to the hackathon Supabase project.
-- Three tables: turns, memories, actions. Supabase manages auth.users.
-- All exposed tables have RLS; authenticated clients get SELECT only.
-- Writes go through service_role inside authenticated route handlers that
-- filter by the verified user's ID (service_role bypasses RLS).

create table public.turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  client_request_id uuid not null,
  input_text text not null check (length(input_text) <= 4000),
  input_kind text not null check (input_kind in ('text','note','voice','suggestion')),
  include_in_context boolean not null default true,
  status text not null default 'processing'
    check (status in ('processing','completed','failed')),
  response jsonb,
  evidence jsonb not null default '[]'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id),
  unique (id, user_id)
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in
    ('inventory','shopping_interest','task','plan','preference')),
  entity_key text not null check (length(entity_key) between 1 and 160),
  entity text not null,
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  status text not null default 'active'
    check (status in ('active','completed','cancelled')),
  confidence numeric(3,2) not null check (confidence between 0 and 1),
  source text not null check (source in ('text','note','voice','manual_edit')),
  source_quote text not null,
  source_turn_id uuid,
  version integer not null default 1 check (version > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category, entity_key),
  foreign key (source_turn_id, user_id)
    references public.turns(id, user_id)
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_turn_id uuid not null,
  kind text not null check (kind = 'calendar.create'),
  proposal_key text not null, -- Deterministic for a source turn + selected intent
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null,
  target_calendar_id text not null,
  version integer not null default 1 check (version > 0),
  approval_level smallint not null default 2 check (approval_level = 2),
  status text not null default 'proposed' check (status in
    ('proposed','executing','succeeded','failed','unknown','cancelled','expired')),
  provider_event_id text not null check (provider_event_id ~ '^[0-9a-v]{5,1024}$'),
  provider_receipt jsonb,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  attempted_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz not null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, proposal_key),
  unique (target_calendar_id, provider_event_id),
  foreign key (source_turn_id, user_id)
    references public.turns(id, user_id),
  check (approved_by is null or approved_by = user_id),
  check (status <> 'succeeded' or
    (provider_receipt is not null and executed_at is not null))
);

create index memories_retrieval
  on public.memories (user_id, category, status, updated_at desc);
create index turns_history
  on public.turns (user_id, conversation_id, created_at desc);
create index actions_status
  on public.actions (user_id, status, updated_at desc);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_turns before update on public.turns
  for each row execute function public.touch_updated_at();
create trigger touch_memories before update on public.memories
  for each row execute function public.touch_updated_at();
create trigger touch_actions before update on public.actions
  for each row execute function public.touch_updated_at();

alter table public.turns enable row level security;
alter table public.memories enable row level security;
alter table public.actions enable row level security;

revoke all on public.turns, public.memories, public.actions from anon, authenticated;
grant select on public.turns, public.memories, public.actions to authenticated;
grant all on public.turns, public.memories, public.actions to service_role;

create policy turns_read_own on public.turns for select to authenticated
  using (user_id = (select auth.uid()));
create policy memories_read_own on public.memories for select to authenticated
  using (user_id = (select auth.uid()));
create policy actions_read_own on public.actions for select to authenticated
  using (user_id = (select auth.uid()));
