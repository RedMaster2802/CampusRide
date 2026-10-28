-- supabase/tests/07_security.sql
-- pgTAP security tests (SECURITY.md D requirements)

begin;
select plan(20);

-- T4/T5/T6: User B cannot read A's rows; authenticated/anon cannot execute server functions; direct writes denied

-- Setup users
select test_as_user('sec_a@example.edu');
update profiles set full_name = 'User A' where email = 'sec_a@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');

select test_as_user('sec_b@example.edu');
update profiles set full_name = 'User B' where email = 'sec_b@example.edu';

-- User B cannot select User A's ride_requests
select is(
  (select count(*) from ride_requests where user_id = (select id from profiles where email = 'sec_a@example.edu')), 0,
  'T4: User B cannot read User A ride_requests'
);

-- User B cannot select User A's pools
select is(
  (select count(*) from pools p
   join pool_members pm on pm.pool_id = p.id
   where pm.user_id = (select id from profiles where email = 'sec_a@example.edu')), 0,
  'T4: User B cannot read User A pools'
);

-- User B cannot select User A's notifications
select is(
  (select count(*) from notifications where user_id = (select id from profiles where email = 'sec_a@example.edu')), 0,
  'T4: User B cannot read User A notifications'
);

-- Authenticated cannot execute run_pool_maintenance
select test_as_user('sec_a@example.edu');
select throws_like(
  run_pool_maintenance(),
  'permission denied',
  'T5: authenticated cannot execute run_pool_maintenance'
);

-- Authenticated cannot execute process_match_queue
select throws_like(
  process_match_queue('SECTOR_128', 'OBS', 10, false),
  'permission denied',
  'T5: authenticated cannot execute process_match_queue'
);

-- Anonymous cannot call any RPC (test by resetting role)
perform set local role anon;
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes'),
  'permission denied',
  'T6: anon cannot call create_ride_request'
);
perform set local role authenticated;

-- Direct inserts/updates on tables denied for authenticated
select throws_like(
  insert into pools (origin, destination, capacity, window_start, window_end)
  values ('SECTOR_128', 'OBS', 4, now(), now() + interval '30 minutes'),
  'permission denied',
  'T6: authenticated cannot insert into pools'
);

select throws_like(
  update profiles set role = 'admin' where id = (select id from profiles where email = 'sec_a@example.edu'),
  'permission denied',
  'T6: authenticated cannot update role'
);

select throws_like(
  update profiles set strikes = 99 where id = (select id from profiles where email = 'sec_a@example.edu'),
  'permission denied',
  'T6: authenticated cannot update strikes'
);

select throws_like(
  update profiles set blocked_until = now() + interval '1 day' where id = (select id from profiles where email = 'sec_a@example.edu'),
  'permission denied',
  'T6: authenticated cannot update blocked_until'
);

select throws_like(
  update profiles set email = 'hacked@example.edu' where id = (select id from profiles where email = 'sec_a@example.edu'),
  'permission denied',
  'T6: authenticated cannot update email'
);

-- T7: Hostile strings rejected by check constraint
select test_as_user('sec_a@example.edu');
select throws_like(
  update profiles set full_name = '; drop table pools; --' where id = (select id from profiles where email = 'sec_a@example.edu'),
  'profiles_name_chk',
  'T7: Hostile name rejected'
);

select throws_like(
  update profiles set full_name = '<script>alert(1)</script>' where id = (select id from profiles where email = 'sec_a@example.edu'),
  'profiles_name_chk',
  'T7: XSS name rejected'
);

select throws_like(
  update profiles set phone = '12345678901' where id = (select id from profiles where email = 'sec_a@example.edu'),
  'profiles_phone_chk',
  'T7: Invalid phone rejected'
);

-- T11: Rate limiting
select test_as_user('sec_rate@example.edu');
update profiles set full_name = 'Rate Test' where email = 'sec_rate@example.edu';

-- Make 6 create requests (limit is 5)
do $$
declare i int; v_uid uuid;
begin
  v_uid := (select id from profiles where email = 'sec_rate@example.edu');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid)::text, true);
  perform set local role authenticated;
  for i in 1..6 loop
    begin
      perform create_ride_request('SECTOR_128', 'OBS', 1, '4', now() + (i || ' minutes')::interval, now() + ((i+30) || ' minutes')::interval);
    exception when others then
      -- Expected on 6th
    end;
  end loop;
end $$;

-- Check rate limited audit log
select is(
  (select count(*) from audit_log where action = 'RATE_LIMITED' and actor = (select id from profiles where email = 'sec_rate@example.edu')), 1,
  'T11: RATE_LIMITED audit log created'
);

-- Another user unaffected
select test_as_user('sec_rate2@example.edu');
update profiles set full_name = 'Rate Test 2' where email = 'sec_rate2@example.edu';
select lives_ok(
  create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes'),
  'T11: Other user not rate limited'
);

-- maintenance_mode = true -> ERR_MAINTENANCE
update app_config set value = 'true' where key = 'maintenance_mode';
select test_as_user('sec_maint@example.edu');
update profiles set full_name = 'Maint Test' where email = 'sec_maint@example.edu';
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes'),
  'ERR_MAINTENANCE',
  'maintenance_mode blocks create'
);
update app_config set value = 'false' where key = 'maintenance_mode';

-- Audit log rows written for strike, block, late cancel, rate-limited, config change
select is(
  (select count(*) from audit_log where action in ('STRIKE_ADDED','USER_BLOCKED','LATE_CANCEL','RATE_LIMITED','CONFIG_CHANGED')) >= 5, true,
  'Audit log has required action types'
);

-- Normal user cannot read, update, delete audit rows
select test_as_user('sec_a@example.edu');
select is(
  (select count(*) from audit_log), 0,
  'User cannot read audit_log'
);

select throws_like(
  delete from audit_log where id = 1,
  'permission denied',
  'User cannot delete audit_log'
);

-- D14: stats counts below stats_min_count are null
select test_as_user('sec_a@example.edu');
select is(
  (get_live_stats() -> 0 ->> 'searching_people') is null, true,
  'D14: stats below min_count returns null'
);

-- D13: No RPC output contains email
select test_as_user('sec_a@example.edu');
select is(
  (get_active_ride() -> 'members') @> '[{"email": "sec_a@example.edu"}]', false,
  'D13: No email in RPC output'
);

-- Privilege proof: list every function in public with executable roles
select diag(
  'Function privileges:' || chr(10) ||
  (select string_agg(routine_name || ': ' || grantee, chr(10))
   from information_schema.routine_privileges
   where routine_schema = 'public' and grantee in ('anon','authenticated')
   order by routine_name, grantee)
);

-- Static checks: no dynamic SQL (EXECUTE) in function bodies
select is(
  (select count(*) from pg_proc
   where pronamespace = 'public'::regnamespace
     and prosrc ilike '%execute%'
     and prosecdef = true), 0,
  'No EXECUTE in security definer functions'
);

-- Every security definer function has search_path in proconfig
select is(
  (select count(*) from pg_proc
   where pronamespace = 'public'::regnamespace
     and prosecdef = true
     and (proconfig is null or not proconfig @> array['search_path=public, pg_temp'])), 0,
  'All security definer functions have search_path'
);

select * from finish();
rollback;