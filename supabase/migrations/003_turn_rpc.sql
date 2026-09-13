-- Turn registration and the per-user lock shared with memory mutations.
-- Applies after 002_memory_rpc.sql. Not yet run against a database.

-- Register a turn. Idempotent on (user_id, client_request_id). One active
-- turn per user; abandoned turns (> 60 s) are marked failed. Application
-- rate limit: 10 turns per rolling minute per user.
create or replace function public.begin_turn(
  p_user_id uuid,
  p_conversation_id uuid,
  p_client_request_id uuid,
  p_input_text text,
  p_input_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.turns%rowtype;
  v_recent integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select * into r from public.turns
   where user_id = p_user_id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('outcome', 'existing', 'turn', to_jsonb(r));
  end if;

  update public.turns
     set status = 'failed', error_code = 'abandoned'
   where user_id = p_user_id
     and status = 'processing'
     and created_at <= now() - interval '60 seconds';

  if exists (
    select 1 from public.turns
     where user_id = p_user_id and status = 'processing'
  ) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  select count(*) into v_recent from public.turns
   where user_id = p_user_id and created_at > now() - interval '60 seconds';
  if v_recent >= 10 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  insert into public.turns (user_id, conversation_id, client_request_id, input_text, input_kind)
  values (p_user_id, p_conversation_id, p_client_request_id, p_input_text, p_input_kind)
  returning * into r;

  return jsonb_build_object('outcome', 'created', 'turn', to_jsonb(r));
end;
$$;

-- Re-open a failed turn for an explicit retry with the same client request id.
create or replace function public.reopen_turn(p_user_id uuid, p_turn_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.turns%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if exists (select 1 from public.turns where user_id = p_user_id and status = 'processing') then
    return jsonb_build_object('outcome', 'busy');
  end if;
  update public.turns
     set status = 'processing', error_code = null, response = null, created_at = now()
   where user_id = p_user_id and id = p_turn_id and status = 'failed'
   returning * into r;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return jsonb_build_object('outcome', 'reopened', 'turn', to_jsonb(r));
end;
$$;

-- Memory mutations take the same per-user lock so a stale in-flight turn can
-- never write a forgotten fact back after a correction or deletion.
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
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
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
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
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

-- Upsert now accepts an optional status so an assistant-driven correction
-- ("done with that", "never mind the shoes") can complete or cancel a fact
-- inside the running turn without going through the manual-edit path.
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
       coalesce(e->>'status', 'active'),
       (e->>'confidence')::numeric,
       e->>'source',
       e->>'quote',
       nullif(e->>'source_turn_id', '')::uuid,
       nullif(e->>'expires_at', '')::timestamptz)
    on conflict (user_id, category, entity_key) do update set
      entity         = excluded.entity,
      value          = excluded.value,
      status         = excluded.status,
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

revoke execute on function public.begin_turn(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.reopen_turn(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_turn(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.reopen_turn(uuid, uuid) to service_role;
