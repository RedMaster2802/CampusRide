-- supabase/tests/02_matching_rules.sql
-- pgTAP tests for matching rules (CONTRACT section 4 rules 5-11)

begin;
select plan(12);

-- Test 5: Target '4' request never joins a capacity-6 pool
select test_as_user('test20@example.edu');
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes'); -- Creates 4-seat pool
select test_as_user('test21@example.edu');
select create_ride_request('SECTOR_128', 'OBS', 3, '4', now(), now() + interval '30 minutes'); -- Fills 4-seat pool
select test_as_user('test22@example.edu');
select is(
  (create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes') -> 'pool' ->> 'capacity')::int, 4,
  'Target 4 joins 4-seat pool, not 6-seat'
);

-- Test 6: ANY joins pool where seats-left-after-join is smallest
-- Setup: 6-seat pool with 3 taken (3 left), 4-seat pool with 3 taken (1 left)
select test_as_user('test30@example.edu');
select create_ride_request('BOTANICAL_METRO', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test31@example.edu');
select create_ride_request('BOTANICAL_METRO', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test32@example.edu');
select create_ride_request('BOTANICAL_METRO', 'OBS', 1, '4', now(), now() + interval '30 minutes'); -- 4-seat pool: 3/4

select test_as_user('test33@example.edu');
select create_ride_request('BOTANICAL_METRO', 'OBS', 1, '6', now(), now() + interval '30 minutes');
select test_as_user('test34@example.edu');
select create_ride_request('BOTANICAL_METRO', 'OBS', 1, '6', now(), now() + interval '30 minutes');
select test_as_user('test35@example.edu');
select create_ride_request('BOTANICAL_METRO', 'OBS', 1, '6', now(), now() + interval '30 minutes'); -- 6-seat pool: 3/6

select test_as_user('test36@example.edu');
select is(
  (create_ride_request('BOTANICAL_METRO', 'OBS', 1, 'ANY', now(), now() + interval '30 minutes') -> 'pool' ->> 'capacity')::int, 4,
  'ANY joins 4-seat pool (1 left) over 6-seat pool (3 left)'
);

-- Test 7: Non-overlapping windows -> two separate OPEN pools
select test_as_user('test40@example.edu');
select create_ride_request('SECTOR_128', 'SECTOR_62', 1, '4', now(), now() + interval '30 minutes');
select test_as_user('test41@example.edu');
select create_ride_request('SECTOR_128', 'SECTOR_62', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select is(
  (select count(*) from pools where origin = 'SECTOR_128' and destination = 'SECTOR_62' and status = 'OPEN'), 2,
  'Non-overlapping windows create separate pools'
);

-- Test 8: Repack - two OPEN pools become compatible after cancellation
select test_as_user('test50@example.edu');
select create_ride_request('OBS', 'BOTANICAL_METRO', 2, '4', now(), now() + interval '60 minutes'); -- Pool A: 2 seats
select test_as_user('test51@example.edu');
select create_ride_request('OBS', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '60 minutes'); -- Pool B: 1 seat

-- Cancel user 51 (1 seat) -> Pool B empty, then repack should merge
select test_as_user('test51@example.edu');
select cancel_ride_request((select id from ride_requests where user_id = (select id from profiles where email = 'test51@example.edu')));

select test_run_maintenance(now() + interval '5 minutes');

select is(
  (select count(*) from pools where origin = 'OBS' and destination = 'BOTANICAL_METRO' and status = 'OPEN'), 1,
  'Repack merged two compatible pools'
);

-- Test 9: Fallback confirm - 3/4 at window_end - 10 min -> CONFIRMED
select test_as_user('test60@example.edu');
select create_ride_request('SECTOR_128', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '20 minutes');
select test_as_user('test61@example.edu');
select create_ride_request('SECTOR_128', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '20 minutes');
select test_as_user('test62@example.edu');
select create_ride_request('SECTOR_128', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '20 minutes'); -- 3/4

-- Run maintenance at fallback time (window_end - 10 min)
select test_run_maintenance(now() + interval '10 minutes'); -- fallback_lead_minutes = 10

select is(
  (select status from pools where origin = 'SECTOR_128' and destination = 'BOTANICAL_METRO' order by created_at desc limit 1), 'CONFIRMED',
  'Fallback confirms 3/4 pool'
);

-- Test 10: Fallback expire - 2/4 -> pool CANCELLED, requests EXPIRED
select test_as_user('test70@example.edu');
select create_ride_request('SECTOR_62', 'OBS', 1, '4', now(), now() + interval '20 minutes');
select test_as_user('test71@example.edu');
select create_ride_request('SECTOR_62', 'OBS', 1, '4', now(), now() + interval '20 minutes'); -- 2/4

select test_run_maintenance(now() + interval '10 minutes');

select is(
  (select status from pools where origin = 'SECTOR_62' and destination = 'OBS' order by created_at desc limit 1), 'CANCELLED',
  'Fallback expires 2/4 pool'
);
select is(
  (select cancel_reason from pools where origin = 'SECTOR_62' and destination = 'OBS' order by created_at desc limit 1), 'NOT_ENOUGH_RIDERS',
  'Cancel reason is NOT_ENOUGH_RIDERS'
);
select is(
  (select count(*) from ride_requests where origin = 'SECTOR_62' and destination = 'OBS' and status = 'EXPIRED'), 2,
  'Requests become EXPIRED'
);

-- Test 11: Cancel before lock -> pool returns to OPEN, remaining SEARCHING, no strike
select test_as_user('test80@example.edu');
select create_ride_request('SECTOR_128', 'OBS', 2, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test81@example.edu');
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now() + interval '1 hour', now() + interval '2 hours');
select test_as_user('test82@example.edu');
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now() + interval '1 hour', now() + interval '2 hours'); -- 4/4 CONFIRMED

select test_as_user('test81@example.edu');
select cancel_ride_request((select id from ride_requests where user_id = (select id from profiles where email = 'test81@example.edu')));

select is(
  (select status from pools where origin = 'SECTOR_128' and destination = 'OBS' order by created_at desc limit 1), 'OPEN',
  'Pool returns to OPEN after early cancel'
);
select is(
  (select count(*) from ride_requests where origin = 'SECTOR_128' and destination = 'OBS' and status = 'SEARCHING'), 2,
  'Remaining requests back to SEARCHING'
);

select * from finish();
rollback;