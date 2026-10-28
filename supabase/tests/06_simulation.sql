-- supabase/tests/06_simulation.sql
-- pgTAP simulation test (CONTRACT section 5 simulation test)

begin;
select plan(15);

-- Create ~200 random requests, cancel ~20%, run maintenance, verify invariants

-- Helper to generate random requests
do $$
declare
  v_origins place[] := array['SECTOR_128','SECTOR_62','OBS','BOTANICAL_METRO'];
  v_destinations place[];
  v_targets target_pref[] := array['4','6','ANY'];
  v_user_base uuid;
  i int;
  v_origin place;
  v_dest place;
  v_party int;
  v_target target_pref;
  v_start timestamptz;
  v_end timestamptz;
  v_uid uuid;
begin
  -- Create 50 test users
  for i in 1..50 loop
    v_uid := gen_random_uuid();
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, 'sim' || i || '@example.edu', 'test', now(), '{"provider":"email"}', '{}', now(), now())
    on conflict (email) do nothing;
    insert into profiles (id, email, full_name) values (v_uid, 'sim' || i || '@example.edu', 'Sim User ' || i)
    on conflict (id) do nothing;
  end loop;
  
  -- Create ~200 requests
  for i in 1..200 loop
    v_origin := v_origins[1 + floor(random() * 4)];
    v_dest := v_origins[1 + floor(random() * 4)];
    while v_dest = v_origin loop
      v_dest := v_origins[1 + floor(random() * 4)];
    end loop;
    v_party := 1 + floor(random() * 3);
    v_target := v_targets[1 + floor(random() * 3)];
    v_start := now() + (floor(random() * 180) || ' minutes')::interval;
    v_end := v_start + (30 + floor(random() * 150) || ' minutes')::interval;
    
    v_uid := (select id from profiles where email = 'sim' || (1 + floor(random() * 50)) || '@example.edu');
    
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid)::text, true);
    perform set local role authenticated;
    
    begin
      perform create_ride_request(v_origin, v_dest, v_party, v_target, v_start, v_end);
    exception when others then
      -- Ignore errors (rate limits, active request, etc.)
    end;
  end loop;
  
  -- Cancel ~20% (40 requests)
  for i in 1..40 loop
    v_uid := (select id from profiles where email = 'sim' || (1 + floor(random() * 50)) || '@example.edu');
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid)::text, true);
    perform set local role authenticated;
    
    begin
      perform cancel_ride_request((
        select id from ride_requests where user_id = v_uid and status in ('SEARCHING','MATCHED') order by random() limit 1
      ));
    exception when others then
      -- Ignore
    end;
  end loop;
  
  -- Run maintenance at advancing times
  perform run_pool_maintenance(now() + interval '5 minutes');
  perform run_pool_maintenance(now() + interval '15 minutes');
  perform run_pool_maintenance(now() + interval '30 minutes');
  perform run_pool_maintenance(now() + interval '60 minutes');
  perform run_pool_maintenance(now() + interval '120 minutes');
end $$;

-- Invariant checks
select is(
  (select count(*) from pools where seats_taken != (
    select coalesce(sum(seats),0) from pool_members where pool_id = pools.id and status = 'ACTIVE'
  )), 0,
  'Invariant: pools.seats_taken = sum of ACTIVE member seats'
);

select is(
  (select count(*) from pools where seats_taken > capacity), 0,
  'Invariant: seats_taken <= capacity always'
);

select is(
  (select count(*) from (
    select user_id, count(*) from pool_members where status = 'ACTIVE' group by user_id having count(*) > 1
  ) t), 0,
  'Invariant: No user has two ACTIVE memberships'
);

select is(
  (select count(*) from pools where status = 'OPEN' and seats_taken = capacity), 0,
  'Invariant: No OPEN pool has seats_taken = capacity'
);

select is(
  (select count(*) from pools where status = 'CONFIRMED' and (meet_at < window_start or meet_at > window_end)), 0,
  'Invariant: CONFIRMED pool meet_at within [window_start, window_end]'
);

select is(
  (select count(*) from pool_members pm
   join ride_requests r on r.id = pm.request_id
   join pools p on p.id = pm.pool_id
   where pm.status = 'ACTIVE'
     and (r.window_start > p.window_start or r.window_end < p.window_end)
  ), 0,
  'Invariant: ACTIVE member request window contains pool window'
);

select is(
  (select count(*) from pool_members pm
   join ride_requests r on r.id = pm.request_id
   join pools p on p.id = pm.pool_id
   where pm.status = 'ACTIVE' and r.target = '4' and p.capacity = 6
  ), 0,
  'Invariant: No target-4 request in capacity-6 pool'
);

select is(
  (select count(*) from pool_members pm
   join ride_requests r on r.id = pm.request_id
   join pools p on p.id = pm.pool_id
   where pm.status = 'ACTIVE' and (r.origin <> p.origin or r.destination <> p.destination)
  ), 0,
  'Invariant: ACTIVE member request has same origin/destination as pool'
);

-- Summary stats
select diag(
  'Pools: ' || (select count(*) from pools) || ', ' ||
  'Avg fill: ' || round(avg(seats_taken::numeric / capacity), 2) || ', ' ||
  'Expired: ' || (select count(*) from ride_requests where status = 'EXPIRED')
  from pools where status in ('CONFIRMED','COMPLETED')
);

select * from finish();
rollback;