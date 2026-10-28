-- 0003_functions.sql — helpers, RPCs, matching, maintenance, auth triggers
-- Every function is security definer with a pinned search_path. Identity is
-- always auth.uid(); no function trusts a client-supplied user id. No dynamic
-- SQL anywhere. Write functions carry `set lock_timeout = '2s'`.

-- ===========================================================================
-- Helpers: config
-- ===========================================================================
create or replace function public.cfg_num(p_key text)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v numeric;
begin
  select (value #>> '{}')::numeric into v from app_config where key = p_key;
  if v is null then
    raise exception 'ERR_CONFIG_MISSING: %', p_key;
  end if;
  return v;
end;
$$;

create or replace function public.cfg_text(p_key text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v text;
begin
  select value #>> '{}' into v from app_config where key = p_key;
  if v is null then
    raise exception 'ERR_CONFIG_MISSING: %', p_key;
  end if;
  return v;
end;
$$;

-- ===========================================================================
-- Helpers: notifications and audit
-- ===========================================================================
create or replace function public.notify(
  p_user uuid, p_type text, p_title text, p_body text, p_payload jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_type not in ('POOL_UPDATED','POOL_CONFIRMED','POOL_EXPIRED','BOOKER_CLAIMED','STRIKE_ADDED','BLOCKED') then
    raise exception 'ERR_NOTIFICATION_TYPE: %', p_type;
  end if;
  insert into notifications(user_id, type, title, body, payload)
  values (p_user, p_type, p_title, p_body, p_payload);
end;
$$;

create or replace function public.audit(
  p_action text, p_entity text, p_entity_id uuid, p_detail jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_action not in ('STRIKE_ADDED','USER_BLOCKED','LATE_CANCEL','RATE_LIMITED','CONFIG_CHANGED') then
    raise exception 'ERR_AUDIT_ACTION: %', p_action;
  end if;
  insert into audit_log(actor, action, entity, entity_id, detail)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_detail);
end;
$$;

-- ===========================================================================
-- Helpers: time, rate limit
-- ===========================================================================
create or replace function public.window_overlap_minutes(
  a_start timestamptz, a_end timestamptz, b_start timestamptz, b_end timestamptz
)
returns numeric
language sql
immutable
as $$
  select extract(epoch from (least(a_end, b_end) - greatest(a_start, b_start))) / 60;
$$;

-- Per-user per-minute rate limiter (D6).
--
-- Rollback note: a rejected call raises inside its own transaction, so the
-- increment (and any row written in that call) is rolled back with it — an
-- audit row for the rejected call itself cannot survive without autonomous
-- transactions. The persistent RATE_LIMITED audit entry is therefore written
-- at the moment the counter reaches the limit (the last call the bucket
-- allows, which commits): exactly one row per user/action/minute-bucket, no
-- log floods. Rejected calls find count >= p_max on every attempt and raise
-- until the bucket rotates, so the limit holds.
create or replace function public.check_rate_limit(p_action text, p_max int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '2s'
as $$
declare
  v_uid uuid := auth.uid();
  v_bucket timestamptz := date_trunc('minute', now());
  v_count int;
begin
  if v_uid is null then
    raise exception 'ERR_NOT_AUTHENTICATED';
  end if;

  insert into api_rate_limits(user_id, action, bucket_start, count)
  values (v_uid, p_action, v_bucket, 1)
  on conflict (user_id, action, bucket_start)
  do update set count = api_rate_limits.count + 1
  returning count into v_count;

  if v_count = p_max then
    insert into audit_log(actor, action, entity, entity_id, detail)
    values (v_uid, 'RATE_LIMITED', p_action, null,
            jsonb_build_object('bucket_start', v_bucket, 'limit', p_max));
  elsif v_count > p_max then
    raise exception 'ERR_RATE_LIMITED'
      using detail = greatest(1, extract(epoch from (v_bucket + interval '1 minute' - now()))::int)::text;
  end if;
end;
$$;

-- ===========================================================================
-- Helpers: pool lifecycle
-- ===========================================================================
create or replace function public.recompute_pool(p_pool uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '2s'
as $$
declare
  v_seats int;
  v_start timestamptz;
  v_end timestamptz;
begin
  if not exists (select 1 from pools where id = p_pool for update) then
    raise exception 'ERR_NOT_FOUND';
  end if;

  select coalesce(sum(pm.seats), 0), max(r.window_start), min(r.window_end)
    into v_seats, v_start, v_end
  from pool_members pm
  join ride_requests r on r.id = pm.request_id
  where pm.pool_id = p_pool and pm.status = 'ACTIVE';

  if v_seats = 0 then
    update pools
    set status = 'CANCELLED', cancel_reason = 'EMPTY', booker_user_id = null
    where id = p_pool;
    return;
  end if;

  update pools
  set seats_taken = v_seats, window_start = v_start, window_end = v_end
  where id = p_pool;

  -- the booker must still be an active member
  update pools
  set booker_user_id = null
  where id = p_pool
    and booker_user_id is not null
    and not exists (
      select 1 from pool_members pm
      where pm.pool_id = p_pool and pm.user_id = pools.booker_user_id and pm.status = 'ACTIVE'
    );
end;
$$;

create or replace function public.confirm_pool(p_pool uuid, p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '2s'
as $$
declare
  v_meet timestamptz;
  m record;
begin
  if not exists (select 1 from pools where id = p_pool for update) then
    raise exception 'ERR_NOT_FOUND';
  end if;

  select least(window_end, greatest(window_start, p_now + interval '10 minutes'))
    into v_meet
  from pools where id = p_pool;

  update pools
  set status = 'CONFIRMED', confirmed_at = p_now, meet_at = v_meet
  where id = p_pool;

  update ride_requests
  set status = 'MATCHED', updated_at = p_now
  where id in (
    select pm.request_id from pool_members pm
    where pm.pool_id = p_pool and pm.status = 'ACTIVE'
  );

  for m in
    select pm.user_id from pool_members pm
    where pm.pool_id = p_pool and pm.status = 'ACTIVE'
  loop
    perform public.notify(m.user_id, 'POOL_CONFIRMED',
      'Pool confirmed',
      'Your pool is confirmed. Open the app for the meeting point and time.',
      jsonb_build_object('pool_id', p_pool));
  end loop;
end;
$$;

create or replace function public.route_lock_key(p_origin place, p_destination place)
returns bigint
language sql
immutable
as $$
  select hashtext('gatepool:' || p_origin::text || '>' || p_destination::text)::bigint;
$$;

-- ===========================================================================
-- Helper: try_match (caller must already hold the route advisory lock)
-- Lock order inside: pool row first, then request rows.
-- ===========================================================================
create or replace function public.try_match(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '2s'
as $$
declare
  r ride_requests%rowtype;
  p pools%rowtype;
  v_member uuid;
begin
  select * into r from ride_requests where id = p_request for update;
  if not found then return; end if;
  if r.status <> 'SEARCHING' or r.pool_id is not null then return; end if;

  -- best-fit candidate: same route, compatible capacity, room, enough overlap
  select p.* into p
  from pools p
  where p.status = 'OPEN'
    and p.origin = r.origin
    and p.destination = r.destination
    and p.seats_taken + r.party_size <= p.capacity
    and (case when r.target = 'ANY' then true else p.capacity = r.target::text::int end)
    and extract(epoch from (least(p.window_end, r.window_end)
          - greatest(p.window_start, r.window_start, now()))) / 60
        >= public.cfg_num('min_overlap_minutes')
  order by (p.capacity - p.seats_taken - r.party_size) asc, p.created_at asc
  limit 1
  for update;

  if found then
    insert into pool_members(pool_id, request_id, user_id, seats)
    values (p.id, r.id, r.user_id, r.party_size);

    update ride_requests set pool_id = p.id, updated_at = now() where id = r.id;

    perform public.recompute_pool(p.id);

    for v_member in
      select pm.user_id from pool_members pm
      where pm.pool_id = p.id and pm.status = 'ACTIVE' and pm.user_id <> r.user_id
    loop
      perform public.notify(v_member, 'POOL_UPDATED',
        'A rider joined your pool',
        'Your pool has more seats taken. Open the app to see the current count.',
        jsonb_build_object('pool_id', p.id));
    end loop;

    select * into p from pools where id = p.id;
    if p.status = 'OPEN' and p.seats_taken = p.capacity then
      perform public.confirm_pool(p.id);
    end if;
  else
    insert into pools(origin, destination, capacity, window_start, window_end)
    values (r.origin, r.destination,
            case when r.target = '6' then 6 else 4 end,
            r.window_start, r.window_end)
    returning * into p;

    insert into pool_members(pool_id, request_id, user_id, seats)
    values (p.id, r.id, r.user_id, r.party_size);

    update ride_requests set pool_id = p.id, updated_at = now() where id = r.id;

    perform public.recompute_pool(p.id);
  end if;
end;
$$;

-- ===========================================================================
-- RPC: create_ride_request
-- ===========================================================================
create or replace function public.create_ride_request(
  p_origin place, p_destination place, p_party_size int, p_target target_pref,
  p_window_start timestamptz, p_window_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '2s'
as $$
declare
  v_uid uuid := auth.uid();
  v_prof profiles%rowtype;
  v_max_party int;
  v_start timestamptz := p_window_start;
  v_end timestamptz := p_window_end;
  v_req uuid;
begin
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  if public.cfg_text('maintenance_mode') = 'true' then raise exception 'ERR_MAINTENANCE'; end if;
  perform public.check_rate_limit('create', public.cfg_num('rl_create_per_min')::int);

  select * into v_prof from profiles where id = v_uid;
  if not found then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  if v_prof.blocked_until is not null and v_prof.blocked_until > now() then
    raise exception 'ERR_BLOCKED' using detail = v_prof.blocked_until::text;
  end if;
  if coalesce(v_prof.full_name, '') = '' then raise exception 'ERR_PROFILE_INCOMPLETE'; end if;
  if p_origin is null or p_destination is null or p_origin = p_destination then
    raise exception 'ERR_INVALID_ROUTE';
  end if;

  v_max_party := case when p_target = '6' then 5 else 3 end;
  if p_party_size < 1 or p_party_size > v_max_party then
    raise exception 'ERR_INVALID_PARTY_SIZE';
  end if;

  if v_start >= v_end then raise exception 'ERR_INVALID_WINDOW'; end if;
  if v_start < now() then v_start := now(); end if;   -- supports "leave now"
  if v_end <= now() then raise exception 'ERR_WINDOW_IN_PAST'; end if;
  if v_end - v_start < make_interval(mins => public.cfg_num('min_window_minutes')::int) then
    raise exception 'ERR_WINDOW_TOO_SHORT';
  end if;
  if v_end - v_start > make_interval(mins => public.cfg_num('max_window_minutes')::int) then
    raise exception 'ERR_WINDOW_TOO_LONG';
  end if;
  if v_start > now() + make_interval(mins => public.cfg_num('max_advance_minutes')::int) then
    raise exception 'ERR_TOO_FAR_AHEAD';
  end if;

  begin
    insert into ride_requests(user_id, origin, destination, party_size, target, window_start, window_end)
    values (v_uid, p_origin, p_destination, p_party_size, p_target, v_start, v_end)
    returning id into v_req;
  exception when unique_violation then
    raise exception 'ERR_ACTIVE_REQUEST_EXISTS';
  end;

  -- never waits: if the route lock is busy the request stays queued
  if pg_try_advisory_xact_lock(public.route_lock_key(p_origin, p_destination)) then
    perform public.process_match_queue(p_origin, p_destination,
      public.cfg_num('matcher_batch_size')::int, true);
  end if;

  return public.get_active_ride();
end;
$$;

-- ===========================================================================
-- RPC: get_active_ride
-- ===========================================================================
create or replace function public.get_active_ride()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  r ride_requests%rowtype;
  p pools%rowtype;
  v_request jsonb;
  v_pool jsonb;
  v_members jsonb;
  v_fare_total int := 0;
  v_fare_per_seat int;
  v_fare_if_full int;
  v_my_fare int;
  v_my_seats int;
  v_meeting_point text;
  v_fb_min int;
  v_lock_at timestamptz;
begin
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;

  select * into r
  from ride_requests
  where user_id = v_uid
    and (status in ('SEARCHING','MATCHED')
         or (status = 'EXPIRED' and updated_at > now() - interval '30 minutes'))
  order by created_at desc, id desc
  limit 1;

  if not found then return null; end if;

  v_request := jsonb_build_object(
    'id', r.id, 'origin', r.origin, 'destination', r.destination,
    'party_size', r.party_size, 'target', r.target,
    'window_start', r.window_start, 'window_end', r.window_end,
    'status', r.status, 'created_at', r.created_at);

  if r.pool_id is null then
    return jsonb_build_object('request', v_request, 'pool', null, 'members', '[]'::jsonb);
  end if;

  select * into p from pools where id = r.pool_id;

  select case when p.capacity = 6 then cap6_total_inr else cap4_total_inr end
    into v_fare_total
  from route_fares
  where origin = p.origin and destination = p.destination;
  if not found then v_fare_total := 0; end if;

  if v_fare_total > 0 and p.seats_taken > 0 then
    v_fare_per_seat := ceil(v_fare_total::numeric / p.seats_taken)::int;
  end if;
  if v_fare_total > 0 then
    v_fare_if_full := ceil(v_fare_total::numeric / p.capacity)::int;
  end if;

  select seats into v_my_seats
  from pool_members
  where pool_id = p.id and user_id = v_uid and status = 'ACTIVE';
  if v_fare_per_seat is not null and v_my_seats is not null then
    v_my_fare := v_fare_per_seat * v_my_seats;
  end if;

  v_meeting_point := public.cfg_text('meet_point_' || lower(p.origin::text));

  v_fb_min := case when p.capacity = 6
                   then public.cfg_num('fallback_min_seats_cap6')::int
                   else public.cfg_num('fallback_min_seats_cap4')::int end;

  if p.meet_at is not null then
    v_lock_at := p.meet_at - make_interval(mins => public.cfg_num('lock_minutes_before_meet')::int);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', pm.user_id,
      'full_name', case when coalesce(pr.full_name, '') = '' then 'Student' else pr.full_name end,
      'seats', pm.seats,
      'is_me', pm.user_id = v_uid,
      'arrived', pm.arrived,
      'phone', case when pm.user_id = v_uid or pr.share_phone then pr.phone end
    ) order by pm.joined_at), '[]'::jsonb)
  into v_members
  from pool_members pm
  join profiles pr on pr.id = pm.user_id
  where pm.pool_id = p.id and pm.status = 'ACTIVE';

  v_pool := jsonb_build_object(
    'id', p.id, 'origin', p.origin, 'destination', p.destination,
    'capacity', p.capacity, 'status', p.status,
    'window_start', p.window_start, 'window_end', p.window_end,
    'meet_at', p.meet_at,
    'seats_taken', p.seats_taken, 'seats_left', p.capacity - p.seats_taken,
    'booker_user_id', p.booker_user_id,
    'lock_at', v_lock_at,
    'fallback_at', p.window_end - make_interval(mins => public.cfg_num('fallback_lead_minutes')::int),
    'fallback_min_seats', v_fb_min,
    'fare_total_inr', coalesce(v_fare_total, 0),
    'fare_per_seat_inr', v_fare_per_seat,
    'fare_per_seat_if_full_inr', v_fare_if_full,
    'my_fare_inr', v_my_fare,
    'meeting_point_name', v_meeting_point);

  return jsonb_build_object('request', v_request, 'pool', v_pool, 'members', v_members);
end;
$$;

-- ===========================================================================
-- RPC: cancel_ride_request
-- ===========================================================================
create or replace function public.cancel_ride_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '2s'
as $$
declare
  v_uid uuid := auth.uid();
  r ride_requests%rowtype;
  p pools%rowtype;
  v_prof profiles%rowtype;
  v_strike boolean := false;
  v_past_lock boolean;
  v_attempts int := 0;
  v_member uuid;
  v_blocked_until timestamptz;
begin
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  perform public.check_rate_limit('cancel', public.cfg_num('rl_cancel_per_min')::int);

  loop
    v_attempts := v_attempts + 1;

    select * into r from ride_requests where id = p_request_id;
    if not found or r.user_id <> v_uid then raise exception 'ERR_NOT_FOUND'; end if;
    if r.status not in ('SEARCHING','MATCHED') then raise exception 'ERR_BAD_STATE'; end if;

    if r.pool_id is null then
      -- still queued: no pool to lock, cancel directly
      select * into r from ride_requests where id = p_request_id for update;
      if not found or r.user_id <> v_uid then raise exception 'ERR_NOT_FOUND'; end if;
      if r.status <> 'SEARCHING' or r.pool_id is not null then
        if v_attempts < 2 then continue; end if;
        raise exception 'ERR_BAD_STATE';
      end if;
      update ride_requests set status = 'CANCELLED', updated_at = now() where id = r.id;
      return jsonb_build_object('ok', true, 'strike_added', false);
    else
      -- lock the pool row FIRST, then the request row
      if not exists (select 1 from pools where id = r.pool_id for update) then
        raise exception 'ERR_NOT_FOUND';
      end if;
      select * into p from pools where id = r.pool_id;
      select * into r from ride_requests where id = p_request_id for update;

      if not found or r.user_id <> v_uid then raise exception 'ERR_NOT_FOUND'; end if;
      if r.status not in ('SEARCHING','MATCHED') then raise exception 'ERR_BAD_STATE'; end if;
      if r.pool_id is distinct from p.id then
        if v_attempts < 2 then continue; end if;
        raise exception 'ERR_BAD_STATE';
      end if;

      v_past_lock := p.status = 'CONFIRMED'
        and p.meet_at is not null
        and now() > p.meet_at - make_interval(mins => public.cfg_num('lock_minutes_before_meet')::int);

      v_strike := v_past_lock
        and p.confirmed_at is not null
        and now() > p.confirmed_at + make_interval(mins => public.cfg_num('cancel_grace_minutes')::int);

      update pool_members
      set status = 'LEFT', left_at = now(), arrived = false
      where pool_id = p.id and request_id = r.id;

      update ride_requests set status = 'CANCELLED', updated_at = now() where id = r.id;

      if v_strike then
        update profiles set strikes = strikes + 1 where id = v_uid
        returning strikes into v_prof.strikes;
        perform public.audit('LATE_CANCEL', 'ride_request', r.id,
          jsonb_build_object('pool_id', p.id));
        perform public.audit('STRIKE_ADDED', 'profiles', v_uid,
          jsonb_build_object('strikes', v_prof.strikes));
        perform public.notify(v_uid, 'STRIKE_ADDED', 'Strike added',
          'You cancelled a confirmed pool after the lock time. This counts as a strike.',
          jsonb_build_object('pool_id', p.id, 'strikes', v_prof.strikes));

        if v_prof.strikes >= public.cfg_num('strike_block_threshold')::int then
          v_blocked_until := now() + make_interval(days => public.cfg_num('strike_block_days')::int);
          update profiles
          set blocked_until = v_blocked_until, strikes = 0
          where id = v_uid;
          perform public.audit('USER_BLOCKED', 'profiles', v_uid,
            jsonb_build_object('blocked_until', v_blocked_until));
          perform public.notify(v_uid, 'BLOCKED', 'Account blocked',
            'You have too many strikes. New requests are blocked for 7 days.',
            jsonb_build_object('blocked_until', v_blocked_until));
        end if;
      end if;

      perform public.recompute_pool(p.id);
      select * into p from pools where id = p.id;

      -- a confirmed pool that lost a member before the lock reopens
      if p.status = 'CONFIRMED' and not v_past_lock then
        update pools set status = 'OPEN', confirmed_at = null, meet_at = null where id = p.id;
        update ride_requests set status = 'SEARCHING', updated_at = now()
        where pool_id = p.id and status = 'MATCHED';
        select * into p from pools where id = p.id;
      end if;

      if p.status in ('OPEN','CONFIRMED') then
        for v_member in
          select pm.user_id from pool_members pm
          where pm.pool_id = p.id and pm.status = 'ACTIVE'
        loop
          perform public.notify(v_member, 'POOL_UPDATED',
            'Your pool changed',
            'A rider left your pool. Open the app to see the current count.',
            jsonb_build_object('pool_id', p.id));
        end loop;
      end if;

      return jsonb_build_object('ok', true, 'strike_added', v_strike);
    end if;
  end loop;
end;
$$;

-- ===========================================================================
-- RPC: claim_booker
-- ===========================================================================
create or replace function public.claim_booker(p_pool_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '2s'
as $$
declare
  v_uid uuid := auth.uid();
  p pools%rowtype;
  v_member uuid;
begin
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  perform public.check_rate_limit('other', public.cfg_num('rl_other_per_min')::int);

  select * into p from pools where id = p_pool_id for update;
  if not found then raise exception 'ERR_NOT_FOUND'; end if;
  if not exists (
    select 1 from pool_members
    where pool_id = p.id and user_id = v_uid and status = 'ACTIVE'
  ) then
    raise exception 'ERR_NOT_MEMBER';
  end if;
  if p.status <> 'CONFIRMED' then raise exception 'ERR_BAD_STATE'; end if;
  if p.booker_user_id is not null then raise exception 'ERR_BOOKER_TAKEN'; end if;

  update pools set booker_user_id = v_uid where id = p.id;

  for v_member in
    select pm.user_id from pool_members pm
    where pm.pool_id = p.id and pm.status = 'ACTIVE' and pm.user_id <> v_uid
  loop
    perform public.notify(v_member, 'BOOKER_CLAIMED', 'Cab booking claimed',
      'A member of your pool said they will book the cab.',
      jsonb_build_object('pool_id', p.id));
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- RPC: mark_arrived
-- ===========================================================================
create or replace function public.mark_arrived(p_pool_id uuid, p_arrived boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '2s'
as $$
declare
  v_uid uuid := auth.uid();
  p pools%rowtype;
begin
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  perform public.check_rate_limit('other', public.cfg_num('rl_other_per_min')::int);

  select * into p from pools where id = p_pool_id for update;
  if not found then raise exception 'ERR_NOT_FOUND'; end if;
  if not exists (
    select 1 from pool_members
    where pool_id = p.id and user_id = v_uid and status = 'ACTIVE'
  ) then
    raise exception 'ERR_NOT_MEMBER';
  end if;
  if p.status <> 'CONFIRMED' then raise exception 'ERR_BAD_STATE'; end if;

  update pool_members
  set arrived = coalesce(p_arrived, true)
  where pool_id = p.id and user_id = v_uid and status = 'ACTIVE';

  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- RPC: get_ride_history
-- ===========================================================================
create or replace function public.get_ride_history(p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int;
  v_out jsonb;
begin
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  select coalesce(jsonb_agg(jsonb_build_object(
      'request_id', h.request_id, 'origin', h.origin, 'destination', h.destination,
      'party_size', h.party_size, 'target', h.target, 'status', h.status,
      'window_start', h.window_start, 'window_end', h.window_end, 'created_at', h.created_at,
      'pool_capacity', h.pool_capacity, 'pool_seats_taken', h.pool_seats_taken, 'meet_at', h.meet_at
    ) order by h.created_at desc), '[]'::jsonb)
  into v_out
  from (
    select r.id as request_id, r.origin, r.destination, r.party_size, r.target, r.status,
           r.window_start, r.window_end, r.created_at,
           p.capacity as pool_capacity, p.seats_taken as pool_seats_taken, p.meet_at
    from ride_requests r
    left join pools p on p.id = r.pool_id
    where r.user_id = v_uid
    order by r.created_at desc
    limit v_limit
  ) h;

  return v_out;
end;
$$;

-- ===========================================================================
-- RPC: get_live_stats
-- ===========================================================================
create or replace function public.get_live_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_min int := public.cfg_num('stats_min_count')::int;
  v_out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'origin', rt.origin, 'destination', rt.destination,
      'searching_people', case when coalesce(q.sp, 0) >= v_min then coalesce(q.sp, 0) end,
      'open_pools', case when coalesce(o.cnt, 0) >= v_min then coalesce(o.cnt, 0) end
    ) order by rt.origin, rt.destination), '[]'::jsonb)
  into v_out
  from (select a, b
        from unnest(enum_range(null::place)) a,
             unnest(enum_range(null::place)) b
        where a <> b) rt
  left join (
    select origin, destination, sum(party_size) as sp
    from ride_requests where status = 'SEARCHING'
    group by origin, destination
  ) q on q.origin = rt.origin and q.destination = rt.destination
  left join (
    select origin, destination, count(*) as cnt
    from pools where status = 'OPEN'
    group by origin, destination
  ) o on o.origin = rt.origin and o.destination = rt.destination;

  return v_out;
end;
$$;

-- ===========================================================================
-- Server-only: process_match_queue
-- ===========================================================================
create or replace function public.process_match_queue(
  p_origin place, p_destination place, p_limit int, p_lock_held boolean default false
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '2s'
as $$
declare
  v_count int := 0;
  v_id uuid;
begin
  if not p_lock_held then
    if not pg_try_advisory_xact_lock(public.route_lock_key(p_origin, p_destination)) then
      return 0;
    end if;
  end if;

  for v_id in
    select id from ride_requests
    where origin = p_origin
      and destination = p_destination
      and status = 'SEARCHING'
      and pool_id is null
    order by created_at, id
    for update skip locked
    limit greatest(coalesce(p_limit, 0), 0)
  loop
    perform public.try_match(v_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ===========================================================================
-- Server-only: run_pool_maintenance
-- ===========================================================================
create or replace function public.run_pool_maintenance(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '2s'
as $$
declare
  rt record;
  a pools%rowtype;
  b pools%rowtype;
  p pools%rowtype;
  m record;
  v_rounds int;
  v_processed int;
  v_iters int;
  v_moved uuid[];
  v_min_overlap numeric := public.cfg_num('min_overlap_minutes');
  v_fb_lead interval := make_interval(mins => public.cfg_num('fallback_lead_minutes')::int);
  v_fb_min int;
  v_complete_after interval := make_interval(mins => public.cfg_num('complete_after_minutes')::int);
  v_last_purge timestamptz;
  v_hist_days int := public.cfg_num('history_retention_days')::int;
  v_old_pools uuid[];
begin
  if not pg_try_advisory_xact_lock(hashtext('gatepool:maintenance')) then
    return;
  end if;

  for rt in
    select a, b
    from unnest(enum_range(null::place)) a,
         unnest(enum_range(null::place)) b
    where a <> b
  loop
    -- skip a route whose lock is busy this run
    if not pg_try_advisory_xact_lock(public.route_lock_key(rt.a, rt.b)) then
      continue;
    end if;

    -- 3. drain the queue for this route before repacking
    v_rounds := 0;
    loop
      v_processed := public.process_match_queue(rt.a, rt.b,
        public.cfg_num('matcher_batch_size')::int, true);
      v_rounds := v_rounds + 1;
      exit when v_processed = 0 or v_rounds >= 20;
    end loop;

    -- 2a. repack: merge compatible OPEN pools (max 100 merges per route)
    v_iters := 0;
    loop
      v_iters := v_iters + 1;
      exit when v_iters > 100;

      -- smallest A among the 200 oldest OPEN pools of this route that has a partner
      select * into a from (
        select * from pools
        where status = 'OPEN' and origin = rt.a and destination = rt.b
        order by created_at
        limit 200
      ) cand
      where exists (
        select 1 from pools b2
        where b2.status = 'OPEN'
          and b2.origin = cand.origin and b2.destination = cand.destination
          and b2.id <> cand.id
          and b2.capacity = cand.capacity
          and b2.seats_taken <= b2.capacity - cand.seats_taken
          and public.window_overlap_minutes(b2.window_start, b2.window_end,
                cand.window_start, cand.window_end) >= v_min_overlap
      )
      order by cand.seats_taken asc, cand.created_at asc
      limit 1;
      exit when not found;

      -- fullest compatible B (oldest on tie)
      select * into b
      from pools
      where status = 'OPEN'
        and origin = rt.a and destination = rt.b
        and id <> a.id
        and capacity = a.capacity
        and seats_taken <= capacity - a.seats_taken
        and public.window_overlap_minutes(window_start, window_end,
              a.window_start, a.window_end) >= v_min_overlap
      order by seats_taken desc, created_at asc
      limit 1;
      exit when not found;

      -- lock both pool rows in ascending id order (lock order is law)
      if a.id < b.id then
        perform 1 from pools where id = a.id for update;
        perform 1 from pools where id = b.id for update;
      else
        perform 1 from pools where id = b.id for update;
        perform 1 from pools where id = a.id for update;
      end if;

      -- re-validate under lock; conditions may have changed
      select * into a from pools where id = a.id;
      select * into b from pools where id = b.id;
      if a.status <> 'OPEN' or b.status <> 'OPEN' then continue; end if;
      if a.capacity <> b.capacity then continue; end if;
      if a.seats_taken + b.seats_taken > b.capacity then continue; end if;
      if public.window_overlap_minutes(a.window_start, a.window_end,
            b.window_start, b.window_end) < v_min_overlap then continue; end if;

      select coalesce(array_agg(user_id), '{}'::uuid[]) into v_moved
      from pool_members
      where pool_id = a.id and status = 'ACTIVE';

      update pool_members set pool_id = b.id
      where pool_id = a.id and status = 'ACTIVE';

      update ride_requests set pool_id = b.id, updated_at = p_now
      where pool_id = a.id and status = 'SEARCHING';

      update pools set status = 'CANCELLED', cancel_reason = 'MERGED' where id = a.id;

      perform public.recompute_pool(b.id);

      if array_length(v_moved, 1) > 0 then
        foreach m in array v_moved loop
          perform public.notify(m, 'POOL_UPDATED', 'Your pool changed',
            'Your pool was merged with another pool on the same route. Open the app for details.',
            jsonb_build_object('pool_id', b.id));
        end loop;
      end if;

      select * into b from pools where id = b.id;
      if b.status = 'OPEN' and b.seats_taken = b.capacity then
        perform public.confirm_pool(b.id, p_now);
      end if;
    end loop;

    -- 2b. fallback: confirm or expire OPEN pools at window_end - fallback_lead
    for p in
      select * from pools
      where status = 'OPEN'
        and origin = rt.a and destination = rt.b
        and p_now >= window_end - v_fb_lead
      for update
    loop
      v_fb_min := case when p.capacity = 6
                       then public.cfg_num('fallback_min_seats_cap6')::int
                       else public.cfg_num('fallback_min_seats_cap4')::int end;

      if p.seats_taken >= v_fb_min then
        perform public.confirm_pool(p.id, p_now);
      else
        update pools set status = 'CANCELLED', cancel_reason = 'NOT_ENOUGH_RIDERS'
        where id = p.id;
        update pool_members set status = 'LEFT', left_at = p_now, arrived = false
        where pool_id = p.id and status = 'ACTIVE';
        update ride_requests set status = 'EXPIRED', updated_at = p_now
        where pool_id = p.id and status = 'SEARCHING';

        for m in select user_id from pool_members where pool_id = p.id loop
          perform public.notify(m.user_id, 'POOL_EXPIRED', 'No pool formed',
            'Not enough riders joined in time. You can search again.',
            jsonb_build_object('pool_id', p.id));
        end loop;
      end if;
    end loop;

    -- 2c. complete old confirmed pools
    update pools
    set status = 'COMPLETED', completed_at = p_now
    where status = 'CONFIRMED'
      and origin = rt.a and destination = rt.b
      and meet_at is not null
      and p_now > meet_at + v_complete_after;

    update ride_requests r
    set status = 'COMPLETED', updated_at = p_now
    from pools pl
    where r.pool_id = pl.id
      and pl.status = 'COMPLETED'
      and pl.origin = rt.a and pl.destination = rt.b
      and r.status = 'MATCHED';
  end loop;

  -- 4. purge, at most once per hour
  select nullif(value #>> '{}', '')::timestamptz into v_last_purge
  from app_config where key = 'last_purge_at';

  if v_last_purge is null or p_now - v_last_purge >= interval '1 hour' then
    delete from notifications where created_at < p_now - interval '30 days';
    delete from api_rate_limits where bucket_start < p_now - interval '1 day';
    delete from audit_log
    where at < p_now - make_interval(days => public.cfg_num('audit_retention_days')::int);

    select coalesce(array_agg(id), '{}'::uuid[]) into v_old_pools
    from pools
    where status in ('COMPLETED','CANCELLED')
      and created_at < p_now - make_interval(days => v_hist_days);

    if array_length(v_old_pools, 1) > 0 then
      delete from pool_members where pool_id = any(v_old_pools);
      delete from ride_requests where pool_id = any(v_old_pools);
      delete from pools where id = any(v_old_pools);
    end if;

    update app_config set value = to_jsonb(p_now), updated_at = now()
    where key = 'last_purge_at';
  end if;
end;
$$;

-- ===========================================================================
-- Auth triggers (on auth.users)
-- ===========================================================================
create or replace function public.enforce_college_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(split_part(new.email, '@', 2)) <> lower(public.cfg_text('allowed_email_domain')) then
    raise exception 'ERR_EMAIL_DOMAIN';
  end if;
  return new;
end;
$$;

create trigger gatepool_enforce_college_email
  before insert on auth.users
  for each row execute function public.enforce_college_email();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles(id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger gatepool_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Grants: the 7 RPCs go to `authenticated`; everything else to nobody.
-- (Re-assert the default revokes here because 0003 created new functions.)
-- ===========================================================================
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

grant execute on function public.create_ride_request(place, place, int, target_pref, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_active_ride() to authenticated;
grant execute on function public.cancel_ride_request(uuid) to authenticated;
grant execute on function public.claim_booker(uuid) to authenticated;
grant execute on function public.mark_arrived(uuid, boolean) to authenticated;
grant execute on function public.get_ride_history(int) to authenticated;
grant execute on function public.get_live_stats() to authenticated;
grant execute on function public.can_access_pool(uuid) to authenticated;
