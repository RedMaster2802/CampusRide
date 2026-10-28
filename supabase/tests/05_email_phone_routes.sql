-- supabase/tests/05_email_phone_routes.sql
-- pgTAP tests for email domain, phone privacy, routes, meeting points, fares, live stats

begin;
select plan(16);

-- Test 16: Email domain trigger rejects wrong domain
select throws_like(
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), 'wrong@domain.com', 'test', now(), '{"provider":"email"}', '{}', now(), now()),
  'ERR_EMAIL_DOMAIN',
  'Email domain trigger rejects wrong domain'
);

-- Test 17: get_active_ride hides phone unless share_phone or self; never returns email
select test_as_user('test130@example.edu');
update profiles set full_name = 'User With Phone', phone = '9876543210', share_phone = true where email = 'test130@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 2, '4', now(), now() + interval '30 minutes');
select test_as_user('test131@example.edu');
update profiles set full_name = 'User No Share', phone = '9876543211', share_phone = false where email = 'test131@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test132@example.edu');
update profiles set full_name = 'User Share', phone = '9876543212', share_phone = true where email = 'test132@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes'); -- 4/4 CONFIRMED

-- Check user 130 sees own phone and user 132's phone (share=true), but not user 131's (share=false)
select test_as_user('test130@example.edu');
select is(
  (get_active_ride() -> 'members' -> 0 ->> 'phone') = '9876543210', true,
  'Self sees own phone'
);
select is(
  (get_active_ride() -> 'members' -> 2 ->> 'phone') = '9876543212', true,
  'Self sees other member phone when share_phone=true'
);
select is(
  (get_active_ride() -> 'members' -> 1 ->> 'phone') is null, true,
  'Self does not see other member phone when share_phone=false'
);

-- No email ever returned
select is(
  (get_active_ride() -> 'members' -> 0 ->> 'email') is null, true,
  'Email never returned in members'
);

-- Test 18: Routes - different destination = separate pools
select test_as_user('test140@example.edu');
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test141@example.edu');
select create_ride_request('SECTOR_128', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '30 minutes');
select is(
  (select count(*) from pools where origin = 'SECTOR_128' and status = 'OPEN'), 2,
  'Different destination = separate pools'
);

-- Different direction = separate pools
select test_as_user('test142@example.edu');
select create_ride_request('OBS', 'SECTOR_62', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test143@example.edu');
select create_ride_request('SECTOR_62', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select is(
  (select count(*) from pools where (origin = 'OBS' and destination = 'SECTOR_62') or (origin = 'SECTOR_62' and destination = 'OBS') and status = 'OPEN'), 2,
  'Different direction = separate pools'
);

-- origin = destination raises ERR_INVALID_ROUTE
select test_as_user('test144@example.edu');
update profiles set full_name = 'Test' where email = 'test144@example.edu';
select throws_like(
  create_ride_request('OBS', 'OBS', 1, '4', now(), now() + interval '30 minutes'),
  'ERR_INVALID_ROUTE',
  'origin = destination raises ERR_INVALID_ROUTE'
);

-- All 12 routes can form and confirm a pool of four singles
-- We'll test a few representative routes
select test_as_user('test150@example.edu');
select create_ride_request('SECTOR_128', 'SECTOR_62', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test151@example.edu');
select create_ride_request('SECTOR_128', 'SECTOR_62', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test152@example.edu');
select create_ride_request('SECTOR_128', 'SECTOR_62', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test153@example.edu');
select is(
  (create_ride_request('SECTOR_128', 'SECTOR_62', 1, '4', now(), now() + interval '30 minutes') -> 'pool' ->> 'status') = '"CONFIRMED"', true,
  'Route SECTOR_128 -> SECTOR_62 confirms'
);

-- Test 19: Meeting point - each of 4 places returns matching meet_point_* value
select test_as_user('test160@example.edu');
update profiles set full_name = 'Test' where email = 'test160@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test161@example.edu');
update profiles set full_name = 'Test' where email = 'test161@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test162@example.edu');
update profiles set full_name = 'Test' where email = 'test162@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test163@example.edu');
update profiles set full_name = 'Test' where email = 'test163@example.edu';
select is(
  (create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes') -> 'pool' ->> 'meeting_point_name') = '"xxxxxxxxx"', true,
  'Meeting point for SECTOR_128 uses meet_point_sector_128'
);

-- Test 20: Fare - set route_fares, get_active_ride returns right total
update route_fares set cap4_total_inr = 200, cap6_total_inr = 300 where origin = 'SECTOR_128' and destination = 'OBS';

select test_as_user('test170@example.edu');
update profiles set full_name = 'Test' where email = 'test170@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test171@example.edu');
update profiles set full_name = 'Test' where email = 'test171@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test172@example.edu');
update profiles set full_name = 'Test' where email = 'test172@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test173@example.edu');
update profiles set full_name = 'Test' where email = 'test173@example.edu';
select is(
  (create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes') -> 'pool' ->> 'fare_total_inr')::int = 200, true,
  '4-seat pool shows cap4_total_inr'
);
select is(
  (create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes') -> 'pool' ->> 'fare_per_seat_inr')::int = 50, true,
  'fare_per_seat_inr = ceil(200/4) = 50'
);

-- Route left at 0 shows 0 or null
update route_fares set cap4_total_inr = 0, cap6_total_inr = 0 where origin = 'SECTOR_62' and destination = 'BOTANICAL_METRO';
select test_as_user('test174@example.edu');
update profiles set full_name = 'Test' where email = 'test174@example.edu';
select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test175@example.edu');
update profiles set full_name = 'Test' where email = 'test175@example.edu';
select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test176@example.edu');
update profiles set full_name = 'Test' where email = 'test176@example.edu';
select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test177@example.edu');
update profiles set full_name = 'Test' where email = 'test177@example.edu';
select is(
  (create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '30 minutes') -> 'pool' ->> 'fare_total_inr')::int = 0, true,
  'Route with 0 fare shows 0'
);

-- Test 21: get_live_stats returns 12 rows and hides counts below stats_min_count
select test_as_user('test180@example.edu');
update profiles set full_name = 'Test' where email = 'test180@example.edu';
select is(
  jsonb_array_length(get_live_stats()), 12,
  'get_live_stats returns 12 rows'
);

-- With stats_min_count = 3, counts < 3 should be null
select test_as_user('test181@example.edu');
update profiles set full_name = 'Test' where email = 'test181@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes'); -- 1 searching
select test_as_user('test182@example.edu');
update profiles set full_name = 'Test' where email = 'test182@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes'); -- 2 searching

select test_as_user('test180@example.edu');
select is(
  (get_live_stats() -> 0 ->> 'searching_people') is null, true,
  'searching_people < 3 returns null'
);

select * from finish();
rollback;