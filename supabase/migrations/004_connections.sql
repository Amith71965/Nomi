-- Per-user linked apps. One row per (user, provider). The OAuth refresh token
-- is stored only as an AES-256-GCM sealed box produced by lib/crypto.ts with
-- INTEGRATIONS_ENCRYPTION_KEY; the plaintext never touches the database.
-- authenticated clients may read their own row but never the token columns
-- (column-level grant). Writes go through service_role inside authenticated
-- routes that filter by the verified user. Additive: touches nothing else.

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_calendar')),
  status text not null default 'linked' check (status in ('linked','revoked','error')),
  account_email text,
  account_label text not null check (length(account_label) between 1 and 200),
  external_account_id text,
  target_id text not null default 'primary',
  scopes text[] not null default '{}',
  refresh_token_ciphertext text,
  token_key_version smallint not null default 1 check (token_key_version > 0),
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_verified_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  check (status <> 'linked' or refresh_token_ciphertext is not null),
  check (status <> 'revoked' or refresh_token_ciphertext is null)
);

create index connections_by_user on public.connections (user_id, provider);

create trigger touch_connections before update on public.connections
  for each row execute function public.touch_updated_at();

alter table public.connections enable row level security;

revoke all on public.connections from anon, authenticated;
grant select (
  id, user_id, provider, status, account_email, account_label, external_account_id,
  target_id, scopes, linked_at, revoked_at, last_verified_at, error_code, created_at, updated_at
) on public.connections to authenticated;
grant all on public.connections to service_role;

create policy connections_read_own on public.connections for select to authenticated
  using (user_id = (select auth.uid()));
