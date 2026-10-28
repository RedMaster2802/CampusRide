-- supabase/tests/01_matching_basic.sql
-- pgTAP tests for basic matching scenarios (CONTRACT section 4 examples)

begin;
select plan(14);

-- Test 1: Four singles, target 4 -> one pool 4/4, CONFIRMED
select test_as_user('test1@example.edu');
select is(create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes') ->> 'pool' is not null, true, 'User 1: pool created');
select test_as_user('test2@example.edu');
select is(create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes') ->> 'pool' is not null, true, 'User 2: joined pool');
select test_as_user('test3@example.edu');
select is(create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes') ->> 'pool' is not null, true, 'User 3: joined pool');
select test_as_user('test4@example.edu');
select results eq (
  select jsonb_build_object(
    'seats_taken', 4,
    'status', 'CONFIRMED',
    'capacity', 4
  )
, create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes') -> 'pool', 'User 4: pool confirmed 4/4');

-- Verify all 4 requests are MATCHED
select is(
  (select count(*) from ride_requests where origin = 'SECTOR_128' and destination = 'OBS' and status = 'MATCHED'), 4,
  'All 4 requests MATCHED'
);

-- Test 2: 2 + 1 + 1 -> confirmed
select test_as_user('test5@example.edu');
select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 2, '4', now(), now() + interval '45 minutes');
select test_as_user('test6@example.edu');
select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '45 minutes');
select test_as_user('test7@example.edu');
select results eq (
  select jsonb_build_object('seats_taken', 4, 'status', 'CONFIRMED', 'capacity', 4)
, create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '45 minutes') -> 'pool', '2+1+1 confirmed');

-- Test 3: 3 + 1 -> confirmed
select test_as_user('test8@example.edu');
select create_ride_request('OBS', 'SECTOR_128', 3, '4', now(), now() + interval '60 minutes');
select test_as_user('test9@example.edu');
select results eq (
  select jsonb_build_object('seats_taken', 4, 'status', 'CONFIRMED', 'capacity', 4)
, create_ride_request('OBS', 'SECTOR_128', 1, '4', now(), now() + interval '60 minutes') -> 'pool', '3+1 confirmed');

-- Test 4: Target 6: 3 + 2 + 1 -> one 6-seat pool CONFIRMED
select test_as_user('test10@example.edu');
select create_ride_request('SECTOR_128', 'SECTOR_62', 3, '6', now(), now() + interval '90 minutes');
select test_as_user('test11@example.edu');
select create_ride_request('SECTOR_128', 'SECTOR_62', 2, '6', now(), now() + interval '90 minutes');
select test_as_user('test12@example.edu');
select results eq (
  select jsonb_build_object('seats_taken', 6, 'status', 'CONFIRMED', 'capacity', 6)
, create_ride_request('SECTOR_128', 'SECTOR_62', 1, '6', now(), now() + interval '90 minutes') -> 'pool', '3+2+1 target 6 confirmed');

select * from finish();
rollback;