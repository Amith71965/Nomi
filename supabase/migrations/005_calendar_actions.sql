-- All approval/change/cancel races serialize on the same action row.
-- The database clock decides expiry. Only the service role may call this RPC.
create or replace function public.mutate_calendar_action(
  p_user_id uuid, p_id uuid, p_version integer, p_operation text,
  p_payload jsonb default null, p_hash text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.actions;
begin
  select * into a from public.actions
    where user_id = p_user_id and id = p_id for update;
  if not found or a.status <> 'proposed' or a.version <> p_version then return null; end if;
  if a.expires_at <= clock_timestamp() then
    update public.actions set status = 'expired' where id = a.id;
    return null;
  end if;
  if p_operation = 'approve' then
    update public.actions set status = 'executing', approved_at = clock_timestamp(),
      approved_by = p_user_id, attempted_at = clock_timestamp() where id = a.id returning * into a;
  elsif p_operation = 'cancel' then
    update public.actions set status = 'cancelled' where id = a.id returning * into a;
  elsif p_operation = 'patch' and p_payload is not null and p_hash is not null then
    update public.actions set payload = p_payload, payload_hash = p_hash, version = version + 1,
      expires_at = clock_timestamp() + interval '10 minutes' where id = a.id returning * into a;
  else
    raise exception 'invalid_action_operation';
  end if;
  return to_jsonb(a);
end;
$$;
revoke all on function public.mutate_calendar_action(uuid,uuid,integer,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.mutate_calendar_action(uuid,uuid,integer,text,jsonb,text) to service_role;
