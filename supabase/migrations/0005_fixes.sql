-- 0005_fixes.sql
-- Fix foreign key ON DELETE behavior for user deletion safety
-- Run after 0001-0004

-- ride_requests.user_id: CASCADE delete requests when user is deleted
alter table ride_requests
  drop constraint if exists ride_requests_user_id_fkey,
  add constraint ride_requests_user_id_fkey
    foreign key (user_id) references profiles(id) on delete cascade;

-- pool_members.user_id: CASCADE delete memberships when user is deleted
alter table pool_members
  drop constraint if exists pool_members_user_id_fkey,
  add constraint pool_members_user_id_fkey
    foreign key (user_id) references profiles(id) on delete cascade;

-- pools.booker_user_id: SET NULL when booker is deleted
alter table pools
  drop constraint if exists pools_booker_user_id_fkey,
  add constraint pools_booker_user_id_fkey
    foreign key (booker_user_id) references profiles(id) on delete set null;

-- Also fix pools table foreign keys if they exist without ON DELETE
-- pools table doesn't have a user_id column, only booker_user_id which is handled above
-- ride_requests.pool_id references pools(id) - keep as is (NO ACTION default)
-- pool_members.pool_id references pools(id) - keep as is (NO ACTION default)
-- pool_members.request_id references ride_requests(id) - keep as is (NO ACTION default)
-- notifications.user_id already has ON DELETE CASCADE (from 0001)