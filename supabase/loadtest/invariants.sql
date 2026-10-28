-- supabase/loadtest/invariants.sql
-- Invariant checks after load test (LOADTEST.md section 5)

-- 1. pools.seats_taken = sum of ACTIVE member seats
select 'seats_taken invariant' as check, count(*) as violations
from pools p
where p.seats_taken != (
  select coalesce(sum(pm.seats), 0)
  from pool_members pm
  where pm.pool_id = p.id and pm.status = 'ACTIVE'
);

-- 2. seats_taken <= capacity always
select 'capacity invariant' as check, count(*) as violations
from pools
where seats_taken > capacity;

-- 3. No user has two ACTIVE memberships
select 'unique membership invariant' as check, count(*) as violations
from (
  select user_id, count(*)
  from pool_members
  where status = 'ACTIVE'
  group by user_id
  having count(*) > 1
) t;

-- 4. No OPEN pool has seats_taken = capacity
select 'open pool full invariant' as check, count(*) as violations
from pools
where status = 'OPEN' and seats_taken = capacity;

-- 5. Every CONFIRMED pool has meet_at within [window_start, window_end]
select 'meet_at window invariant' as check, count(*) as violations
from pools
where status = 'CONFIRMED'
  and (meet_at < window_start or meet_at > window_end);

-- 6. Every ACTIVE member's request window contains the pool window
select 'member window contains pool window' as check, count(*) as violations
from pool_members pm
join ride_requests r on r.id = pm.request_id
join pools p on p.id = pm.pool_id
where pm.status = 'ACTIVE'
  and (r.window_start > p.window_start or r.window_end < p.window_end);

-- 7. No target-4 request sits in a capacity-6 pool
select 'target-capacity invariant' as check, count(*) as violations
from pool_members pm
join ride_requests r on r.id = pm.request_id
join pools p on p.id = pm.pool_id
where pm.status = 'ACTIVE'
  and r.target = '4'
  and p.capacity = 6;

-- 8. Every ACTIVE member's request has same origin/destination as pool
select 'route consistency invariant' as check, count(*) as violations
from pool_members pm
join ride_requests r on r.id = pm.request_id
join pools p on p.id = pm.pool_id
where pm.status = 'ACTIVE'
  and (r.origin != p.origin or r.destination != p.destination);

-- Summary statistics
select 
  (select count(*) from pools) as total_pools,
  (select count(*) from pools where status = 'CONFIRMED') as confirmed_pools,
  (select count(*) from pools where status = 'OPEN') as open_pools,
  (select count(*) from pools where status = 'CANCELLED') as cancelled_pools,
  (select count(*) from ride_requests where status = 'EXPIRED') as expired_requests,
  round(avg(seats_taken::numeric / capacity), 3) as avg_fill_rate
from pools
where status in ('CONFIRMED','COMPLETED');