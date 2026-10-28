-- supabase/tests/03_cancel_strikes.sql
-- pgTAP tests for cancel logic and strikes (CONTRACT section 6 state machines)

begin;
select plan(10);

-- Test 12: Cancel after lock and after grace -> strike added
-- Setup: pool confirmed, meet_at in future
select test_as_user('test90@example.edu');
select create_ride_request('SECTOR_128', 'OBS', 2, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test91@example.edu');
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test92@example.edu');
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now() + interval '1 hour', now() + interval '2 hours'); -- 4/4 CONFIRMED

-- Get pool and simulate time passing past lock_at
select test_as_user('test91@example.edu');
select cancel_ride_request((select id from ride_requests where user_id = (select id from profiles where email = 'test91@example.edu')));

-- Should have strike (cancel after lock_at = meet_at - 10 min, and after grace period)
select is(
  (select strikes from profiles where email = 'test91@example.edu'), 1,
  'Strike added for late cancel'
);

-- Test 13: Third strike sets blocked_until
select test_as_user('test93@example.edu');
select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test94@example.edu');
select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test95@example.edu');
select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test96@example.edu');
select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now() + interval '1 hour', now() + interval '2 hours');

-- Simulate 3 late cancels for test93
-- First late cancel
select test_as_user('test93@example.edu');
select cancel_ride_request((select id from ride_requests where user_id = (select id from profiles where email = 'test93@example.edu')));

-- Second late cancel (need to re-create pool)
select test_as_user('test93@example.edu');
select create_ride_request('SECTOR_62', 'OBS', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test97@example.edu');
select create_ride_request('SECTOR_62', 'OBS', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test98@example.edu');
select create_ride_request('SECTOR_62', 'OBS', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test99@example.edu');
select create_ride_request('SECTOR_62', 'OBS', 1, '4', now() + interval '1 hour', now() + interval '2 hours');

select test_as_user('test93@example.edu');
select cancel_ride_request((select id from ride_requests where user_id = (select id from profiles where email = 'test93@example.edu')));

-- Third late cancel
select test_as_user('test93@example.edu');
select create_ride_request('OBS', 'BOTANICAL_METRO', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test100@example.edu');
select create_ride_request('OBS', 'BOTANICAL_METRO', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test101@example.edu');
select create_ride_request('OBS', 'BOTANICAL_METRO', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test102@example.edu');
select create_ride_request('OBS', 'BOTANICAL_METRO', 1, '4', now() + interval '1 hour', now() + interval '2 hours');

select test_as_user('test93@example.edu');
select cancel_ride_request((select id from ride_requests where user_id = (select id from profiles where email = 'test93@example.edu')));

select is(
  (select blocked_until is not null from profiles where email = 'test93@example.edu'), true,
  'Third strike blocks user'
);
select is(
  (select strikes from profiles where email = 'test93@example.edu'), 0,
  'Strikes reset after block'
);

-- Test: Blocked user gets ERR_BLOCKED
select test_as_user('test93@example.edu');
select throws_like(
  create_ride_request('SECTOR_128', 'SECTOR_62', 1, '4', now(), now() + interval '30 minutes'),
  'ERR_BLOCKED',
  'Blocked user cannot create request'
);

select * from finish();
rollback;