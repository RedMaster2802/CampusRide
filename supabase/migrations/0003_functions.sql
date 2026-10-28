-- 0003_functions.sql
-- GatePool RPC functions and helpers (CONTRACT v1.2 section 7 + AGENT_BACKEND section 2)

-- Helper: cfg_num - read numeric config value
create or replace function cfg_num(p_key text) returns numeric
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v jsonb;
begin
  select value into v from app_config where key = p_key;
  if v is null then
    raise exception 'config key % not found', p_key;
  end if;
  return v::numeric;
end $$;

-- Helper: cfg_text - read text config value
create or replace function cfg_text(p_key text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v jsonb;
begin
  select value into v from app_config where key = p_key;
  if v is null then
    raise exception 'config key % not found', p_key;
  end if;
  return v #>> '{}';
end $$;

-- Helper: notify - insert notification
create or replace function notify(
  p_user uuid, p_type text, p_title text, p_body text, p_payload jsonb default '{}'
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_type not in ('POOL_UPDATED','POOL_CONFIRMED','POOL_EXPIRED','BOOKER_CLAIMED','STRIKE_ADDED','BLOCKED') then
    raise exception 'invalid notification type: %', p_type;
  end if;
  insert into notifications (user_id, type, title, body, payload)
  values (p_user, p_type, p_title, p_body, p_payload);
end $$;

-- Helper: window_overlap_minutes
create or replace function window_overlap_minutes(
  a_start timestamptz, a_end timestamptz, b_start timestamptz, b_end timestamptz
) returns numeric
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return extract(epoch from (least(a_end, b_end) - greatest(a_start, b_start))) / 60;
end $$;

-- Helper: check_rate_limit
create or replace function check_rate_limit(p_action text, p_max int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_bucket timestamptz := date_trunc('minute', now());
  v_count int;
begin
  insert into api_rate_limits (user_id, action, bucket_start, count)
  values (auth.uid(), p_action, v_bucket, 1)
  on conflict (user_id, action, bucket_start) do update set count = api_rate_limits.count + 1
  returning count into v_count;
  
  if v_count > p_max then
    -- Log only on first over-limit hit to avoid flood
    if v_count = p_max + 1 then
      insert into audit_log (actor, action, entity, entity_id, detail)
      values (auth.uid(), 'RATE_LIMITED', 'api_rate_limits', null,
              jsonb_build_object('action', p_action, 'max', p_max, 'bucket', v_bucket));
    end if;
    raise exception 'ERR_RATE_LIMITED' using detail = (extract(epoch from (v_bucket + interval '1 minute' - now()))::int)::text;
  end if;
end $$;

-- Helper: audit
create or replace function audit(p_action text, p_entity text, p_entity_id uuid, p_detail jsonb default '{}') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_action not in ('STRIKE_ADDED','USER_BLOCKED','LATE_CANCEL','RATE_LIMITED','CONFIG_CHANGED') then
    raise exception 'invalid audit action: %', p_action;
  end if;
  insert into audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_detail);
end $$;

-- Helper: recompute_pool
create or replace function recompute_pool(p_pool uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_seats_taken smallint;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_booker_active boolean;
begin
  -- Lock pool row
  lock table pools in row exclusive mode;
  
  select sum(seats)::smallint,
         max(r.window_start),
         min(r.window_end)
  into v_seats_taken, v_window_start, v_window_end
  from pool_members pm
  join ride_requests r on r.id = pm.request_id
  where pm.pool_id = p_pool and pm.status = 'ACTIVE';
  
  v_seats_taken := coalesce(v_seats_taken, 0);
  
  update pools
  set seats_taken = v_seats_taken,
      window_start = v_window_start,
      window_end = v_window_end
  where id = p_pool;
  
  -- If zero active members, cancel pool
  if v_seats_taken = 0 then
    update pools set status = 'CANCELLED', cancel_reason = 'EMPTY', booker_user_id = null where id = p_pool;
    return;
  end if;
  
  -- If booker is no longer active, clear booker
  select exists(
    select 1 from pool_members pm
    join ride_requests r on r.id = pm.request_id
    where pm.pool_id = p_pool and pm.status = 'ACTIVE' and pm.user_id = pools.booker_user_id
  ) into v_booker_active from pools where id = p_pool;
  
  if not v_booker_active then
    update pools set booker_user_id = null where id = p_pool;
  end if;
end $$;

-- Helper: confirm_pool
create or replace function confirm_pool(p_pool uuid, p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pool pools%rowtype;
  v_meet_at timestamptz;
begin
  select * into v_pool from pools where id = p_pool for update;
  
  v_meet_at := least(v_pool.window_end, greatest(v_pool.window_start, p_now + interval '10 minutes'));
  
  update pools
  set status = 'CONFIRMED',
      confirmed_at = p_now,
      meet_at = v_meet_at
  where id = p_pool;
  
  update ride_requests set status = 'MATCHED', updated_at = p_now
  where pool_id = p_pool and status = 'SEARCHING';
  
  -- Notify all active members
  perform notify(pm.user_id, 'POOL_CONFIRMED', 'Pool confirmed', 
                 'Your pool is confirmed. Meet at ' || cfg_text('meet_point_' || lower(v_pool.origin::text)) || ' at ' || to_char(v_meet_at at time zone 'Asia/Kolkata', 'HH24:MI'),
                 jsonb_build_object('pool_id', p_pool))
  from pool_members pm
  where pm.pool_id = p_pool and pm.status = 'ACTIVE';
end $$;

-- Helper: route_lock_key
create or replace function route_lock_key(p_origin place, p_destination place) returns bigint
language sql immutable as $$
  select hashtext('gatepool:' || p_origin::text || '>' || p_destination::text);
$$;

-- Helper: try_match (caller holds route advisory lock)
create or replace function try_match(p_request uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_req ride_requests%rowtype;
  v_pool pools%rowtype;
  v_capacity smallint;
  v_seats_taken smallint;
  v_fallback_min int;
begin
  -- Load request for update
  select * into v_req from ride_requests where id = p_request for update;
  if v_req.status <> 'SEARCHING' or v_req.pool_id is not null then
    return; -- already matched or cancelled
  end if;
  
  -- Find best candidate pool
  select p.* into v_pool
  from pools p
  where p.status = 'OPEN'
    and p.origin = v_req.origin
    and p.destination = v_req.destination
    and p.seats_taken + v_req.party_size <= p.capacity
    and (v_req.target = 'ANY' or p.capacity = v_req.target::text::int)
    and extract(epoch from (
      least(p.window_end, v_req.window_end)
      - greatest(p.window_start, v_req.window_start, now())
    )) / 60 >= cfg_num('min_overlap_minutes')
  order by (p.capacity - p.seats_taken - v_req.party_size) asc, p.created_at asc
  limit 1
  for update;
  
  if found then
    -- Join existing pool
    v_capacity := v_pool.capacity;
    insert into pool_members (pool_id, request_id, user_id, seats)
    values (v_pool.id, v_req.id, v_req.user_id, v_req.party_size);
    
    update ride_requests set pool_id = v_pool.id, updated_at = now() where id = v_req.id;
    
    perform recompute_pool(v_pool.id);
    
    -- Notify other active members
    perform notify(pm.user_id, 'POOL_UPDATED', 'Pool updated',
                   'A new rider joined your pool',
                   jsonb_build_object('pool_id', v_pool.id))
    from pool_members pm
    where pm.pool_id = v_pool.id and pm.status = 'ACTIVE' and pm.user_id <> v_req.user_id;
    
    -- Check if full
    select seats_taken into v_seats_taken from pools where id = v_pool.id;
    if v_seats_taken = v_capacity then
      perform confirm_pool(v_pool.id);
    end if;
  else
    -- Create new pool
    v_capacity := case when v_req.target = '6' then 6 else 4 end;
    insert into pools (origin, destination, capacity, window_start, window_end, status, seats_taken)
    values (v_req.origin, v_req.destination, v_capacity, v_req.window_start, v_req.window_end, 'OPEN', 0)
    returning id into v_pool.id;
    
    insert into pool_members (pool_id, request_id, user_id, seats)
    values (v_pool.id, v_req.id, v_req.user_id, v_req.party_size);
    
    update ride_requests set pool_id = v_pool.id, updated_at = now() where id = v_req.id;
    
    perform recompute_pool(v_pool.id);
  end if;
end $$;

-- RPC: create_ride_request
create or replace function create_ride_request(
  p_origin place, p_destination place, p_party_size int, p_target target_pref,
  p_window_start timestamptz, p_window_end timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '2s' as $$
declare
  v_uid uuid;
  v_profile profiles%rowtype;
  v_max_party int;
  v_start timestamptz := p_window_start;
  v_end timestamptz := p_window_end;
  v_now timestamptz := now();
  v_req_id uuid;
  v_lock_held boolean;
begin
  -- Auth
  v_uid := auth.uid();
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  
  -- Maintenance mode
  if cfg_text('maintenance_mode') = 'true' then raise exception 'ERR_MAINTENANCE'; end if;
  
  -- Rate limit
  perform check_rate_limit('create', cfg_num('rl_create_per_min')::int);
  
  -- Profile
  select * into v_profile from profiles where id = v_uid;
  if v_profile.blocked_until is not null and v_profile.blocked_until > v_now then
    raise exception 'ERR_BLOCKED' using detail = v_profile.blocked_until::text;
  end if;
  if v_profile.full_name = '' then raise exception 'ERR_PROFILE_INCOMPLETE'; end if;
  
  -- Route validation
  if p_origin = p_destination then raise exception 'ERR_INVALID_ROUTE'; end if;
  if p_origin is null or p_destination is null then raise exception 'ERR_INVALID_ROUTE'; end if;
  
  -- Party size validation
  v_max_party := case when p_target = '6' then 5 else 3 end;
  if p_party_size < 1 or p_party_size > v_max_party then raise exception 'ERR_INVALID_PARTY_SIZE'; end if;
  
  -- Window validation
  if v_start >= v_end then raise exception 'ERR_INVALID_WINDOW'; end if;
  if v_start < v_now then v_start := v_now; end if; -- "leave now" support
  if v_end <= v_now then raise exception 'ERR_WINDOW_IN_PAST'; end if;
  if extract(epoch from (v_end - v_start)) / 60 < cfg_num('min_window_minutes') then raise exception 'ERR_WINDOW_TOO_SHORT'; end if;
  if extract(epoch from (v_end - v_start)) / 60 > cfg_num('max_window_minutes') then raise exception 'ERR_WINDOW_TOO_LONG'; end if;
  if v_start > v_now + (cfg_num('max_advance_minutes') || ' minutes')::interval then raise exception 'ERR_TOO_FAR_AHEAD'; end if;
  
  -- Insert request (queued)
  begin
    insert into ride_requests (user_id, origin, destination, party_size, target, window_start, window_end, status, pool_id)
    values (v_uid, p_origin, p_destination, p_party_size, p_target, v_start, v_end, 'SEARCHING', null)
    returning id into v_req_id;
  exception when unique_violation then
    if sqlstate = '23505' then -- one_active_request_per_user
      raise exception 'ERR_ACTIVE_REQUEST_EXISTS';
    else
      raise;
    end if;
  end;
  
  -- Try to get advisory lock and process queue
  if pg_try_advisory_xact_lock(route_lock_key(p_origin, p_destination)) then
    perform process_match_queue(p_origin, p_destination, cfg_num('matcher_batch_size')::int, true);
  end if;
  
  -- Return active ride (may still be queued)
  return get_active_ride();
end $$;

-- RPC: get_active_ride
create or replace function get_active_ride() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_req ride_requests%rowtype;
  v_pool pools%rowtype;
  v_members jsonb;
  v_fare_total int;
  v_fare_per_seat int;
  v_fare_per_seat_if_full int;
  v_my_fare int;
  v_meeting_point text;
  v_fallback_at timestamptz;
  v_lock_at timestamptz;
  v_fallback_min_seats int;
  v_route_fare route_fares%rowtype;
begin
  if v_uid is null then return null; end if;
  
  -- Find latest active/expired request
  select * into v_req
  from ride_requests
  where user_id = v_uid
    and (status in ('SEARCHING','MATCHED') or (status = 'EXPIRED' and updated_at > now() - interval '30 minutes'))
  order by created_at desc
  limit 1;
  
  if not found then return null; end if;
  
  -- Build request object
  if v_req.pool_id is null then
    return jsonb_build_object(
      'request', jsonb_build_object(
        'id', v_req.id, 'origin', v_req.origin, 'destination', v_req.destination,
        'party_size', v_req.party_size, 'target', v_req.target,
        'window_start', v_req.window_start, 'window_end', v_req.window_end,
        'status', v_req.status, 'created_at', v_req.created_at
      ),
      'pool', null,
      'members', '[]'::jsonb
    );
  end if;
  
  -- Load pool
  select * into v_pool from pools where id = v_req.pool_id;
  
  -- Fare from route_fares
  select * into v_route_fare from route_fares where origin = v_pool.origin and destination = v_pool.destination;
  v_fare_total := case when v_pool.capacity = 4 then v_route_fare.cap4_total_inr else v_route_fare.cap6_total_inr end;
  
  if v_fare_total > 0 and v_pool.seats_taken > 0 then
    v_fare_per_seat := (v_fare_total + v_pool.seats_taken - 1) / v_pool.seats_taken; -- ceil
  else
    v_fare_per_seat := null;
  end if;
  
  if v_fare_total > 0 then
    v_fare_per_seat_if_full := (v_fare_total + v_pool.capacity - 1) / v_pool.capacity; -- ceil
  else
    v_fare_per_seat_if_full := null;
  end if;
  
  v_my_fare := case when v_fare_per_seat is not null then v_fare_per_seat * v_req.party_size else null end;
  
  v_meeting_point := cfg_text('meet_point_' || lower(v_pool.origin::text));
  v_fallback_at := v_pool.window_end - (cfg_num('fallback_lead_minutes') || ' minutes')::interval;
  v_fallback_min_seats := case when v_pool.capacity = 4 then cfg_num('fallback_min_seats_cap4')::int else cfg_num('fallback_min_seats_cap6')::int end;
  v_lock_at := case when v_pool.meet_at is not null then v_pool.meet_at - (cfg_num('lock_minutes_before_meet') || ' minutes')::interval else null end;
  
  -- Members
  select jsonb_agg(jsonb_build_object(
    'user_id', pm.user_id,
    'full_name', coalesce(nullif(p.full_name, ''), 'Student'),
    'seats', pm.seats,
    'is_me', pm.user_id = v_uid,
    'arrived', pm.arrived,
    'phone', case when pm.user_id = v_uid or p.share_phone then p.phone else null end
  )) into v_members
  from pool_members pm
  join profiles p on p.id = pm.user_id
  where pm.pool_id = v_pool.id and pm.status = 'ACTIVE';
  
  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_req.id, 'origin', v_req.origin, 'destination', v_req.destination,
      'party_size', v_req.party_size, 'target', v_req.target,
      'window_start', v_req.window_start, 'window_end', v_req.window_end,
      'status', v_req.status, 'created_at', v_req.created_at
    ),
    'pool', jsonb_build_object(
      'id', v_pool.id, 'origin', v_pool.origin, 'destination', v_pool.destination,
      'capacity', v_pool.capacity, 'status', v_pool.status,
      'window_start', v_pool.window_start, 'window_end', v_pool.window_end,
      'meet_at', v_pool.meet_at,
      'seats_taken', v_pool.seats_taken,
      'seats_left', v_pool.capacity - v_pool.seats_taken,
      'booker_user_id', v_pool.booker_user_id,
      'lock_at', v_lock_at,
      'fallback_at', v_fallback_at,
      'fallback_min_seats', v_fallback_min_seats,
      'fare_total_inr', v_fare_total,
      'fare_per_seat_inr', v_fare_per_seat,
      'fare_per_seat_if_full_inr', v_fare_per_seat_if_full,
      'my_fare_inr', v_my_fare,
      'meeting_point_name', v_meeting_point
    ),
    'members', coalesce(v_members, '[]'::jsonb)
  );
end $$;

-- RPC: cancel_ride_request
create or replace function cancel_ride_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '2s' as $$
declare
  v_uid uuid := auth.uid();
  v_req ride_requests%rowtype;
  v_pool pools%rowtype;
  v_strike boolean := false;
  v_now timestamptz := now();
  v_member pool_members%rowtype;
begin
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  perform check_rate_limit('cancel', cfg_num('rl_cancel_per_min')::int);
  
  -- Load request
  select * into v_req from ride_requests where id = p_request_id;
  if not found or v_req.user_id <> v_uid then raise exception 'ERR_NOT_FOUND'; end if;
  if v_req.status not in ('SEARCHING','MATCHED') then raise exception 'ERR_BAD_STATE'; end if;
  
  if v_req.pool_id is null then
    -- Still queued: just cancel the request
    update ride_requests set status = 'CANCELLED', updated_at = v_now where id = p_request_id;
    return jsonb_build_object('ok', true, 'strike_added', false);
  end if;
  
  -- Has a pool: lock pool first, then request
  loop
    select * into v_pool from pools where id = v_req.pool_id for update;
    select * into v_req from ride_requests where id = p_request_id for update;
    
    if v_req.pool_id is null then
      -- Pool was cleared meanwhile, retry from top
      continue;
    end if;
    exit;
  end loop;
  
  -- Determine strike
  if v_pool.status = 'CONFIRMED' and v_pool.meet_at is not null then
    if v_now > v_pool.meet_at - (cfg_num('lock_minutes_before_meet') || ' minutes')::interval
       and v_now > v_pool.confirmed_at + (cfg_num('cancel_grace_minutes') || ' minutes')::interval then
      v_strike := true;
    end if;
  end if;
  
  -- Update member and request
  select * into v_member from pool_members where pool_id = v_pool.id and request_id = p_request_id;
  update pool_members set status = 'LEFT', left_at = v_now, arrived = false where id = v_member.id;
  update ride_requests set status = 'CANCELLED', updated_at = v_now where id = p_request_id;
  
  if v_strike then
    update profiles set strikes = strikes + 1 where id = v_uid;
    perform audit('LATE_CANCEL', 'ride_requests', p_request_id, jsonb_build_object('pool_id', v_pool.id));
    perform audit('STRIKE_ADDED', 'profiles', v_uid, jsonb_build_object('new_strikes', (select strikes from profiles where id = v_uid)));
    perform notify(v_uid, 'STRIKE_ADDED', 'Late cancellation', 'You cancelled after the lock time. This counts as a strike.',
                   jsonb_build_object('strikes', (select strikes from profiles where id = v_uid)));
    
    -- Check block threshold
    if (select strikes from profiles where id = v_uid) >= cfg_num('strike_block_threshold')::int then
      update profiles set blocked_until = v_now + (cfg_num('strike_block_days') || ' days')::interval, strikes = 0 where id = v_uid;
      perform audit('USER_BLOCKED', 'profiles', v_uid, jsonb_build_object('blocked_until', v_now + (cfg_num('strike_block_days') || ' days')::interval));
      perform notify(v_uid, 'BLOCKED', 'Account blocked', 'You have 3 strikes. Your account is blocked for 7 days.',
                     jsonb_build_object('blocked_until', v_now + (cfg_num('strike_block_days') || ' days')::interval));
    end if;
  end if;
  
  perform recompute_pool(v_pool.id);
  
  -- Check if pool should reopen
  if v_pool.status = 'CONFIRMED' and not v_strike then
    -- Before lock: reopen pool
    update pools set status = 'OPEN', confirmed_at = null, meet_at = null where id = v_pool.id;
    update ride_requests set status = 'SEARCHING', updated_at = v_now where pool_id = v_pool.id and status = 'MATCHED';
    perform notify(pm.user_id, 'POOL_UPDATED', 'Pool reopened', 'A member left before the lock time.',
                   jsonb_build_object('pool_id', v_pool.id))
    from pool_members pm where pm.pool_id = v_pool.id and pm.status = 'ACTIVE';
  elsif v_pool.status = 'CONFIRMED' and v_strike then
    -- After lock: stays CONFIRMED, notify remaining
    perform notify(pm.user_id, 'POOL_UPDATED', 'Pool updated', 'A member left.',
                   jsonb_build_object('pool_id', v_pool.id))
    from pool_members pm where pm.pool_id = v_pool.id and pm.status = 'ACTIVE';
  elsif v_pool.status = 'OPEN' then
    -- Notify remaining
    perform notify(pm.user_id, 'POOL_UPDATED', 'Pool updated', 'A member left.',
                   jsonb_build_object('pool_id', v_pool.id))
    from pool_members pm where pm.pool_id = v_pool.id and pm.status = 'ACTIVE';
  end if;
  
  return jsonb_build_object('ok', true, 'strike_added', v_strike);
end $$;

-- RPC: claim_booker
create or replace function claim_booker(p_pool_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '2s' as $$
declare
  v_uid uuid := auth.uid();
  v_pool pools%rowtype;
begin
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  perform check_rate_limit('claim_booker', cfg_num('rl_other_per_min')::int);
  
  select * into v_pool from pools where id = p_pool_id for update;
  if not found then raise exception 'ERR_NOT_FOUND'; end if;
  if v_pool.status <> 'CONFIRMED' then raise exception 'ERR_BAD_STATE'; end if;
  if not exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_uid and status = 'ACTIVE') then
    raise exception 'ERR_NOT_MEMBER';
  end if;
  if v_pool.booker_user_id is not null then raise exception 'ERR_BOOKER_TAKEN'; end if;
  
  update pools set booker_user_id = v_uid where id = p_pool_id;
  
  perform notify(pm.user_id, 'BOOKER_CLAIMED', 'Cab booked', 'A member has booked the cab.',
                 jsonb_build_object('pool_id', p_pool_id, 'booker_user_id', v_uid))
  from pool_members pm where pm.pool_id = p_pool_id and pm.status = 'ACTIVE' and pm.user_id <> v_uid;
  
  return jsonb_build_object('ok', true);
end $$;

-- RPC: mark_arrived
create or replace function mark_arrived(p_pool_id uuid, p_arrived boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '2s' as $$
declare
  v_uid uuid := auth.uid();
  v_pool pools%rowtype;
begin
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  perform check_rate_limit('mark_arrived', cfg_num('rl_other_per_min')::int);
  
  select * into v_pool from pools where id = p_pool_id;
  if not found then raise exception 'ERR_NOT_FOUND'; end if;
  if v_pool.status <> 'CONFIRMED' then raise exception 'ERR_BAD_STATE'; end if;
  if not exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_uid and status = 'ACTIVE') then
    raise exception 'ERR_NOT_MEMBER';
  end if;
  
  update pool_members set arrived = p_arrived where pool_id = p_pool_id and user_id = v_uid and status = 'ACTIVE';
  return jsonb_build_object('ok', true);
end $$;

-- RPC: get_ride_history
create or replace function get_ride_history(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := greatest(1, least(50, p_limit));
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'ERR_NOT_AUTHENTICATED'; end if;
  
  select jsonb_agg(jsonb_build_object(
    'request_id', r.id, 'origin', r.origin, 'destination', r.destination,
    'party_size', r.party_size, 'target', r.target, 'status', r.status,
    'window_start', r.window_start, 'window_end', r.window_end, 'created_at', r.created_at,
    'pool_capacity', p.capacity, 'pool_seats_taken', p.seats_taken, 'meet_at', p.meet_at
  )) into v_rows
  from ride_requests r
  left join pools p on p.id = r.pool_id
  where r.user_id = v_uid
  order by r.created_at desc
  limit v_limit;
  
  return coalesce(v_rows, '[]'::jsonb);
end $$;

-- RPC: get_live_stats
create or replace function get_live_stats() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_stats jsonb := '[]'::jsonb;
  v_min_count int := cfg_num('stats_min_count')::int;
  v_route record;
  v_searching int;
  v_open_pools int;
begin
  for v_route in
    select a as origin, b as destination
    from unnest(enum_range(null::place)) a, unnest(enum_range(null::place)) b
    where a <> b
  loop
    select coalesce(sum(party_size), 0) into v_searching
    from ride_requests
    where origin = v_route.origin and destination = v_route.destination
      and status = 'SEARCHING' and pool_id is null;
    
    select count(*) into v_open_pools
    from pools
    where origin = v_route.origin and destination = v_route.destination
      and status = 'OPEN';
    
    v_stats := v_stats || jsonb_build_object(
      'origin', v_route.origin, 'destination', v_route.destination,
      'searching_people', case when v_searching >= v_min_count then v_searching else null end,
      'open_pools', case when v_open_pools >= v_min_count then v_open_pools else null end
    );
  end loop;
  
  return v_stats;
end $$;

-- Server-only: process_match_queue
create or replace function process_match_queue(
  p_origin place, p_destination place, p_limit int, p_lock_held boolean default false
) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_processed int := 0;
  v_req_id uuid;
begin
  if not p_lock_held then
    if not pg_try_advisory_xact_lock(route_lock_key(p_origin, p_destination)) then
      return 0;
    end if;
  end if;
  
  for v_req_id in
    select id from ride_requests
    where origin = p_origin and destination = p_destination
      and status = 'SEARCHING' and pool_id is null
    order by created_at, id
    for update skip locked
    limit p_limit
  loop
    perform try_match(v_req_id);
    v_processed := v_processed + 1;
  end loop;
  
  return v_processed;
end $$;

-- Server-only: run_pool_maintenance
create or replace function run_pool_maintenance(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_route record;
  v_pool pools%rowtype;
  v_pool_b pools%rowtype;
  v_last_purge timestamptz;
  v_purge_interval interval := '1 hour';
  i int;
begin
  -- Global maintenance lock
  if not pg_try_advisory_xact_lock(hashtext('gatepool:maintenance')) then
    return;
  end if;
  
  -- For each route: drain queue, repack, fallback, complete
  for v_route in
    select a as origin, b as destination
    from unnest(enum_range(null::place)) a, unnest(enum_range(null::place)) b
    where a <> b
  loop
    -- Try route lock
    if not pg_try_advisory_xact_lock(route_lock_key(v_route.origin, v_route.destination)) then
      continue;
    end if;
    
    -- Drain queue
    for i in 1..20 loop
      if process_match_queue(v_route.origin, v_route.destination, cfg_num('matcher_batch_size')::int, true) = 0 then
        exit;
      end if;
    end loop;
    
    -- Repack (max 100 iterations, max 200 pools per route)
    for i in 1..100 loop
      select p1.* into v_pool
      from pools p1
      join pools p2 on p2.origin = p1.origin and p2.destination = p1.destination
                    and p2.capacity = p1.capacity and p2.id <> p1.id
      where p1.status = 'OPEN' and p1.origin = v_route.origin and p1.destination = v_route.destination
        and p1.seats_taken <= p2.capacity - p2.seats_taken
        and extract(epoch from (least(p1.window_end, p2.window_end) - greatest(p1.window_start, p2.window_start, p_now))) / 60 >= cfg_num('min_overlap_minutes')
      order by p1.seats_taken asc, p2.seats_taken desc
      limit 1;
      
      if not found then exit; end if;
      
      -- Move members from v_pool to v_pool_b (the fuller one)
      select * into v_pool_b from pools where id = (
        select p2.id from pools p2
        where p2.origin = v_pool.origin and p2.destination = v_pool.destination
          and p2.capacity = v_pool.capacity and p2.id <> v_pool.id
          and v_pool.seats_taken <= p2.capacity - p2.seats_taken
          and extract(epoch from (least(v_pool.window_end, p2.window_end) - greatest(v_pool.window_start, p2.window_start, p_now))) / 60 >= cfg_num('min_overlap_minutes')
        order by p2.seats_taken desc
        limit 1
      );
      
      -- Update members
      update pool_members set pool_id = v_pool_b.id where pool_id = v_pool.id and status = 'ACTIVE';
      update ride_requests set pool_id = v_pool_b.id where pool_id = v_pool.id and status = 'SEARCHING';
      
      -- Cancel source pool
      update pools set status = 'CANCELLED', cancel_reason = 'MERGED' where id = v_pool.id;
      
      perform recompute_pool(v_pool_b.id);
      
      -- Notify moved members
      perform notify(pm.user_id, 'POOL_UPDATED', 'Pool updated', 'Your pool was merged with another.',
                     jsonb_build_object('pool_id', v_pool_b.id))
      from pool_members pm where pm.pool_id = v_pool_b.id and pm.status = 'ACTIVE';
      
      -- Check if full
      if (select seats_taken from pools where id = v_pool_b.id) = (select capacity from pools where id = v_pool_b.id) then
        perform confirm_pool(v_pool_b.id, p_now);
      end if;
    end loop;
    
    -- Fallback
    for v_pool in
      select * from pools
      where origin = v_route.origin and destination = v_route.destination
        and status = 'OPEN'
        and p_now >= window_end - (cfg_num('fallback_lead_minutes') || ' minutes')::interval
    loop
      if v_pool.capacity = 4 then
        if v_pool.seats_taken >= cfg_num('fallback_min_seats_cap4')::int then
          perform confirm_pool(v_pool.id, p_now);
        else
          update pools set status = 'CANCELLED', cancel_reason = 'NOT_ENOUGH_RIDERS' where id = v_pool.id;
          update pool_members set status = 'LEFT', left_at = p_now where pool_id = v_pool.id and status = 'ACTIVE';
          update ride_requests set status = 'EXPIRED', updated_at = p_now where pool_id = v_pool.id and status = 'SEARCHING';
          perform notify(pm.user_id, 'POOL_EXPIRED', 'Pool expired', 'Not enough riders joined in time.',
                         jsonb_build_object('pool_id', v_pool.id))
          from pool_members pm where pm.pool_id = v_pool.id and pm.status = 'LEFT';
        end if;
      else
        if v_pool.seats_taken >= cfg_num('fallback_min_seats_cap6')::int then
          perform confirm_pool(v_pool.id, p_now);
        else
          update pools set status = 'CANCELLED', cancel_reason = 'NOT_ENOUGH_RIDERS' where id = v_pool.id;
          update pool_members set status = 'LEFT', left_at = p_now where pool_id = v_pool.id and status = 'ACTIVE';
          update ride_requests set status = 'EXPIRED', updated_at = p_now where pool_id = v_pool.id and status = 'SEARCHING';
          perform notify(pm.user_id, 'POOL_EXPIRED', 'Pool expired', 'Not enough riders joined in time.',
                         jsonb_build_object('pool_id', v_pool.id))
          from pool_members pm where pm.pool_id = v_pool.id and pm.status = 'LEFT';
        end if;
      end if;
    end loop;
    
    -- Complete old confirmed pools
    for v_pool in
      select * from pools
      where origin = v_route.origin and destination = v_route.destination
        and status = 'CONFIRMED'
        and p_now > meet_at + (cfg_num('complete_after_minutes') || ' minutes')::interval
    loop
      update pools set status = 'COMPLETED', completed_at = p_now where id = v_pool.id;
      update ride_requests set status = 'COMPLETED' where pool_id = v_pool.id and status = 'MATCHED';
    end loop;
  end loop;
  
  -- Purge (at most once per hour)
  select (value #>> '{}')::timestamptz into v_last_purge from app_config where key = 'last_purge_at';
  if v_last_purge is null or p_now > v_last_purge + v_purge_interval then
    -- Purge old notifications (30 days)
    delete from notifications where created_at < p_now - interval '30 days';
    -- Purge old rate limits (1 day)
    delete from api_rate_limits where bucket_start < p_now - interval '1 day';
    -- Purge old audit log
    delete from audit_log where at < p_now - (cfg_num('audit_retention_days') || ' days')::interval;
    -- Purge completed/cancelled pools and related data
    delete from pool_members where pool_id in (
      select id from pools where status in ('COMPLETED','CANCELLED') and created_at < p_now - (cfg_num('history_retention_days') || ' days')::interval
    );
    delete from ride_requests where pool_id in (
      select id from pools where status in ('COMPLETED','CANCELLED') and created_at < p_now - (cfg_num('history_retention_days') || ' days')::interval
    );
    delete from pools where status in ('COMPLETED','CANCELLED') and created_at < p_now - (cfg_num('history_retention_days') || ' days')::interval;
    
    update app_config set value = to_jsonb(p_now), updated_at = p_now where key = 'last_purge_at';
  end if;
end $$;

-- Auth triggers
-- Enforce college email domain on signup
create or replace function enforce_college_email() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if lower(split_part(new.email, '@', 2)) <> lower(cfg_text('allowed_email_domain')) then
    raise exception 'ERR_EMAIL_DOMAIN';
  end if;
  return new;
end $$;

drop trigger if exists enforce_college_email on auth.users;
create trigger enforce_college_email
before insert on auth.users
for each row execute function enforce_college_email();

-- Handle new user: create profile
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, email) values (new.id, new.email);
  return new;
end $$;

drop trigger if exists handle_new_user on auth.users;
create trigger handle_new_user
after insert on auth.users
for each row execute function handle_new_user();

-- Grants for RPCs (only to authenticated)
revoke all on function create_ride_request(place, place, int, target_pref, timestamptz, timestamptz) from public;
grant execute on function create_ride_request(place, place, int, target_pref, timestamptz, timestamptz) to authenticated;

revoke all on function get_active_ride() from public;
grant execute on function get_active_ride() to authenticated;

revoke all on function cancel_ride_request(uuid) from public;
grant execute on function cancel_ride_request(uuid) to authenticated;

revoke all on function claim_booker(uuid) from public;
grant execute on function claim_booker(uuid) to authenticated;

revoke all on function mark_arrived(uuid, boolean) from public;
grant execute on function mark_arrived(uuid, boolean) to authenticated;

revoke all on function get_ride_history(int) from public;
grant execute on function get_ride_history(int) to authenticated;

revoke all on function get_live_stats() from public;
grant execute on function get_live_stats() to authenticated;

-- Server-only functions: NOT granted to authenticated
revoke all on function process_match_queue(place, place, int, boolean) from public;
revoke all on function run_pool_maintenance(timestamptz) from public;
revoke all on function enforce_college_email() from public;
revoke all on function handle_new_user() from public;

-- Security: explicitly revoke from all non-admin roles for helper functions
revoke all on function cfg_num(text) from public, anon, authenticated;
revoke all on function cfg_text(text) from public, anon, authenticated;
revoke all on function notify(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function window_overlap_minutes(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function check_rate_limit(text, int) from public, anon, authenticated;
revoke all on function audit(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function recompute_pool(uuid) from public, anon, authenticated;
revoke all on function confirm_pool(uuid, timestamptz) from public, anon, authenticated;
revoke all on function route_lock_key(place, place) from public, anon, authenticated;
revoke all on function try_match(uuid) from public, anon, authenticated;
revoke all on function process_match_queue(place, place, int, boolean) from public, anon, authenticated;
revoke all on function run_pool_maintenance(timestamptz) from public, anon, authenticated;
revoke all on function enforce_college_email() from public, anon, authenticated;
revoke all on function handle_new_user() from public, anon, authenticated;

-- Default privileges: prevent auto-grants to anon/authenticated
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;