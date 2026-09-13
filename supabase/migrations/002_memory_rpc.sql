-- Memory mutation RPCs. Service-role only. Each function is one transaction so
-- a correction/deletion and the context invalidation can never be split.
-- Applies after 001_initial.sql. Not yet run against a database.

-- Flip the user's turns out of model context. Display history is preserved;
-- future model calls must not see text that could recreate a forgotten fact.
create or replace function public.invalidate_context(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.turns
     set include_in_context = false
   where user_id = p_user_id
     and include_in_context = true;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- One active turn at a time: edits are refused while the assistant is working
-- so a stale in-flight turn cannot write a forgotten fact back.
create or replace function public.has_active_turn(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.turns
     where user_id = p_user_id
       and status = 'processing'
       and created_at > now() - interval '60 seconds'
  );
$$;

-- Batch upsert of explicit facts. Same source turn reprocessed → no-op.
-- An older turn (created before the row's last update) cannot overwrite a
-- newer correction. Manual edits (null source turn) always apply.
create or replace function public.upsert_memories(p_user_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  rec record;
  v_results jsonb := '[]'::jsonb;
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 8 then
    raise exception 'invalid_entries';
  end if;

  for e in select * from jsonb_array_elements(p_entries) loop
    insert into public.memories as m
      (user_id, category, entity_key, entity, value, status, confidence,
       source, source_quote, source_turn_id, expires_at)
    values
      (p_user_id,
       e->>'category',
       e->>'entity_key',
       e->>'entity',
       e->'value',
       'active',
       (e->>'confidence')::numeric,
       e->>'source',
       e->>'quote',
       nullif(e->>'source_turn_id', '')::uuid,
       nullif(e->>'expires_at', '')::timestamptz)
    on conflict (user_id, category, entity_key) do update set
      entity         = excluded.entity,
      value          = excluded.value,
      status         = 'active',
      confidence     = excluded.confidence,
      source         = excluded.source,
      source_quote   = excluded.source_quote,
      source_turn_id = excluded.source_turn_id,
      expires_at     = excluded.expires_at,
      version        = m.version + 1
    where m.source_turn_id is distinct from excluded.source_turn_id
      and (
        excluded.source_turn_id is null
        or coalesce(
             (select t.created_at from public.turns t
               where t.id = excluded.source_turn_id and t.user_id = p_user_id),
             now()
           ) >= m.updated_at
      )
    returning m.*, (m.xmax = 0) as inserted into rec;

    if not found then
      continue;
    end if;

    v_results := v_results || jsonb_build_object(
      'operation', case when rec.inserted then 'created' else 'updated' end,
      'memory', to_jsonb(rec) - 'inserted'
    );
  end loop;

  return jsonb_build_object('results', v_results);
end;
$$;

-- Explicit UI Save. Optimistic version check; invalidates context on success.
-- p_patch keys: value (object), status (text), expiresAt (string or null).
create or replace function public.patch_memory(
  p_user_id uuid,
  p_memory_id uuid,
  p_version integer,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.memories%rowtype;
begin
  if public.has_active_turn(p_user_id) then
    return jsonb_build_object('outcome', 'turn_in_progress');
  end if;

  select * into r from public.memories
   where user_id = p_user_id and id = p_memory_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if r.version <> p_version then
    return jsonb_build_object('outcome', 'version_conflict');
  end if;

  update public.memories
     set value          = coalesce(p_patch->'value', value),
         status         = coalesce(p_patch->>'status', status),
         expires_at     = case when p_patch ? 'expiresAt'
                               then nullif(p_patch->>'expiresAt', '')::timestamptz
                               else expires_at end,
         source         = 'manual_edit',
         source_turn_id = null,
         version        = version + 1
   where id = p_memory_id and user_id = p_user_id and version = p_version
   returning * into r;

  if not found then
    return jsonb_build_object('outcome', 'version_conflict');
  end if;

  perform public.invalidate_context(p_user_id);
  return jsonb_build_object('outcome', 'updated', 'memory', to_jsonb(r));
end;
$$;

-- Confirmed deletion. Removes the row and invalidates context in one transaction.
create or replace function public.delete_memory(
  p_user_id uuid,
  p_memory_id uuid,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if public.has_active_turn(p_user_id) then
    return jsonb_build_object('outcome', 'turn_in_progress');
  end if;

  delete from public.memories
   where user_id = p_user_id and id = p_memory_id and version = p_version;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    if exists (select 1 from public.memories where user_id = p_user_id and id = p_memory_id) then
      return jsonb_build_object('outcome', 'version_conflict');
    end if;
    return jsonb_build_object('outcome', 'not_found');
  end if;

  perform public.invalidate_context(p_user_id);
  return jsonb_build_object('outcome', 'deleted');
end;
$$;

-- Lock these down: only the server (service_role) may call them.
revoke execute on function public.invalidate_context(uuid) from public, anon, authenticated;
revoke execute on function public.has_active_turn(uuid) from public, anon, authenticated;
revoke execute on function public.upsert_memories(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.patch_memory(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.delete_memory(uuid, uuid, integer) from public, anon, authenticated;

grant execute on function public.invalidate_context(uuid) to service_role;
grant execute on function public.has_active_turn(uuid) to service_role;
grant execute on function public.upsert_memories(uuid, jsonb) to service_role;
grant execute on function public.patch_memory(uuid, uuid, integer, jsonb) to service_role;
grant execute on function public.delete_memory(uuid, uuid, integer) to service_role;
