-- Approval claim for level-2 actions. The ONLY path from `proposed` to
-- `executing`. The update is conditional on user, id, version, status and
-- expiry, so a double click, a stale card, or a cancel race can never produce
-- two executions. Applies after 004_connections.sql. Additive.

create or replace function public.claim_action(
  p_user_id uuid,
  p_action_id uuid,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.actions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Expire first so an expired proposal never reports a version conflict.
  update public.actions
     set status = 'expired'
   where user_id = p_user_id
     and id = p_action_id
     and status = 'proposed'
     and expires_at <= now();

  update public.actions
     set status = 'executing',
         approved_at = now(),
         approved_by = p_user_id,
         attempted_at = now()
   where user_id = p_user_id
     and id = p_action_id
     and version = p_version
     and status = 'proposed'
     and expires_at > now()
  returning * into r;

  if found then
    return jsonb_build_object('outcome', 'claimed', 'action', to_jsonb(r));
  end if;

  select * into r from public.actions
   where user_id = p_user_id and id = p_action_id;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if r.status = 'expired' then
    return jsonb_build_object('outcome', 'expired', 'action', to_jsonb(r));
  end if;
  if r.status = 'executing' then
    return jsonb_build_object('outcome', 'already_processing', 'action', to_jsonb(r));
  end if;
  if r.status <> 'proposed' then
    return jsonb_build_object('outcome', 'not_proposed', 'action', to_jsonb(r));
  end if;
  return jsonb_build_object('outcome', 'stale', 'action', to_jsonb(r));
end;
$$;

-- Cancel a proposal. Only from `proposed`, only on the current version.
create or replace function public.cancel_action(
  p_user_id uuid,
  p_action_id uuid,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.actions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  update public.actions
     set status = 'cancelled'
   where user_id = p_user_id
     and id = p_action_id
     and version = p_version
     and status = 'proposed'
  returning * into r;

  if found then
    return jsonb_build_object('outcome', 'cancelled', 'action', to_jsonb(r));
  end if;

  select * into r from public.actions
   where user_id = p_user_id and id = p_action_id;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if r.status = 'executing' then
    return jsonb_build_object('outcome', 'already_processing', 'action', to_jsonb(r));
  end if;
  if r.status <> 'proposed' then
    return jsonb_build_object('outcome', 'not_proposed', 'action', to_jsonb(r));
  end if;
  return jsonb_build_object('outcome', 'stale', 'action', to_jsonb(r));
end;
$$;

-- Edit a proposal before approval. Bumps the version so an older card cannot
-- approve what the user no longer sees.
create or replace function public.patch_action(
  p_user_id uuid,
  p_action_id uuid,
  p_version integer,
  p_payload jsonb,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.actions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  update public.actions
     set payload = p_payload,
         payload_hash = p_payload_hash,
         version = version + 1
   where user_id = p_user_id
     and id = p_action_id
     and version = p_version
     and status = 'proposed'
     and expires_at > now()
  returning * into r;

  if found then
    return jsonb_build_object('outcome', 'updated', 'action', to_jsonb(r));
  end if;

  select * into r from public.actions
   where user_id = p_user_id and id = p_action_id;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if r.status = 'proposed' and r.expires_at <= now() then
    return jsonb_build_object('outcome', 'expired', 'action', to_jsonb(r));
  end if;
  if r.status <> 'proposed' then
    return jsonb_build_object('outcome', 'not_proposed', 'action', to_jsonb(r));
  end if;
  return jsonb_build_object('outcome', 'stale', 'action', to_jsonb(r));
end;
$$;

-- Record the outcome of an execution attempt. `succeeded` requires a receipt
-- and an execution time (the table's own check enforces that too).
create or replace function public.settle_action(
  p_user_id uuid,
  p_action_id uuid,
  p_status text,
  p_receipt jsonb,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.actions%rowtype;
begin
  if p_status not in ('succeeded', 'failed', 'unknown') then
    return jsonb_build_object('outcome', 'invalid_status');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  update public.actions
     set status = p_status,
         provider_receipt = p_receipt,
         executed_at = case when p_status = 'succeeded' then now() else executed_at end,
         error_code = p_error_code
   where user_id = p_user_id
     and id = p_action_id
     and status in ('executing', 'unknown')
  returning * into r;

  if found then
    return jsonb_build_object('outcome', 'settled', 'action', to_jsonb(r));
  end if;
  return jsonb_build_object('outcome', 'not_claimed');
end;
$$;

revoke execute on function public.claim_action(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.cancel_action(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.patch_action(uuid, uuid, integer, jsonb, text) from public, anon, authenticated;
revoke execute on function public.settle_action(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_action(uuid, uuid, integer) to service_role;
grant execute on function public.cancel_action(uuid, uuid, integer) to service_role;
grant execute on function public.patch_action(uuid, uuid, integer, jsonb, text) to service_role;
grant execute on function public.settle_action(uuid, uuid, text, jsonb, text) to service_role;
