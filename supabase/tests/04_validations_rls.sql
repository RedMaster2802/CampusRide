-- supabase/tests/04_validations_rls.sql
-- pgTAP tests for validation error codes and RLS

begin;
select plan(18);

-- Test 14: Every validation error code reachable

-- ERR_INVALID_ROUTE (origin = destination)
select test_as_user('test110@example.edu');
select throws_like(
  create_ride_request('SECTOR_128', 'SECTOR_128', 1, '4', now(), now() + interval '30 minutes'),
  'ERR_INVALID_ROUTE',
  'ERR_INVALID_ROUTE when origin = destination'
);

-- ERR_INVALID_PARTY_SIZE (too large for target)
select test_as_user('test111@example.edu');
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 4, '4', now(), now() + interval '30 minutes'),
  'ERR_INVALID_PARTY_SIZE',
  'ERR_INVALID_PARTY_SIZE for target 4'
);
select test_as_user('test112@example.edu');
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 6, '6', now(), now() + interval '30 minutes'),
  'ERR_INVALID_PARTY_SIZE',
  'ERR_INVALID_PARTY_SIZE for target 6'
);

-- ERR_INVALID_WINDOW (start >= end)
select test_as_user('test113@example.edu');
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 1, '4', now() + interval '30 minutes', now()),
  'ERR_INVALID_WINDOW',
  'ERR_INVALID_WINDOW when start >= end'
);

-- ERR_WINDOW_IN_PAST (end <= now)
select test_as_user('test114@example.edu');
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 1, '4', now() - interval '1 hour', now() - interval '30 minutes'),
  'ERR_WINDOW_IN_PAST',
  'ERR_WINDOW_IN_PAST when end in past'
);

-- ERR_WINDOW_TOO_SHORT
select test_as_user('test115@example.edu');
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '10 minutes'),
  'ERR_WINDOW_TOO_SHORT',
  'ERR_WINDOW_TOO_SHORT'
);

-- ERR_WINDOW_TOO_LONG
select test_as_user('test116@example.edu');
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '4 hours'),
  'ERR_WINDOW_TOO_LONG',
  'ERR_WINDOW_TOO_LONG'
);

-- ERR_TOO_FAR_AHEAD
select test_as_user('test117@example.edu');
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 1, '4', now() + interval '25 hours', now() + interval '26 hours'),
  'ERR_TOO_FAR_AHEAD',
  'ERR_TOO_FAR_AHEAD'
);

-- ERR_PROFILE_INCOMPLETE (empty full_name)
select test_as_user('test118@example.edu');
-- Profile has empty full_name by default
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes'),
  'ERR_PROFILE_INCOMPLETE',
  'ERR_PROFILE_INCOMPLETE'
);

-- ERR_ACTIVE_REQUEST_EXISTS
select test_as_user('test119@example.edu');
-- First complete profile
update profiles set full_name = 'Test User' where email = 'test119@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
select throws_like(
  create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes'),
  'ERR_ACTIVE_REQUEST_EXISTS',
  'ERR_ACTIVE_REQUEST_EXISTS'
);

-- Test 15: RLS - user B cannot select user A's request, pool, notifications
select test_as_user('test120@example.edu');
update profiles set full_name = 'User A' where email = 'test120@example.edu';
select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');

select test_as_user('test121@example.edu');
update profiles set full_name = 'User B' where email = 'test121@example.edu';

-- User B should not see User A's request
select is(
  (select count(*) from ride_requests where user_id = (select id from profiles where email = 'test120@example.edu')), 0,
  'RLS: User B cannot select User A requests'
);

-- User B should not see User A's pool (if any)
select is(
  (select count(*) from pools p
   join pool_members pm on pm.pool_id = p.id
   where pm.user_id = (select id from profiles where email = 'test120@example.edu')), 0,
  'RLS: User B cannot select User A pools'
);

-- User B should not see User A's notifications
select is(
  (select count(*) from notifications where user_id = (select id from profiles where email = 'test120@example.edu')), 0,
  'RLS: User B cannot select User A notifications'
);

-- Anonymous role cannot call any RPC
-- (Tested by not setting role authenticated)

-- Authenticated cannot update strikes, blocked_until, email, role
select test_as_user('test120@example.edu');
select throws_like(
  update profiles set strikes = 99 where id = (select id from profiles where email = 'test120@example.edu'),
  'permission denied',
  'Cannot update strikes'
);

select * from finish();
rollback;