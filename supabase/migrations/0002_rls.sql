-- 0002_rls.sql — Row level security, privileges, role settings
-- Every table gets RLS. `audit_log` and `api_rate_limits` get NO policies:
-- nobody but the table owner (server functions) can touch them.

-- ---------------------------------------------------------------------------
-- Helper used by the pools / pool_members policies. A policy on pool_members
-- that sub-queries pool_members directly raises "infinite recursion detected
-- in policy", so the membership check lives in a security definer function
-- that bypasses RLS. Returns true when the caller has ANY membership row
-- (ACTIVE or LEFT) for the pool.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_pool(p_pool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from pool_members
    where pool_id = p_pool_id
      and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table profiles         enable row level security;
alter table app_config       enable row level security;
alter table route_fares      enable row level security;
alter table pools            enable row level security;
alter table ride_requests    enable row level security;
alter table pool_members     enable row level security;
alter table notifications    enable row level security;
alter table api_rate_limits  enable row level security;
alter table audit_log        enable row level security;

alter table audit_log       force row level security;
alter table api_rate_limits force row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- profiles: see and update your own row (column grants below narrow the update)
create policy profiles_select_own on profiles
  for select using (id = auth.uid());
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- app_config: readable by any logged-in user, no writes
create policy app_config_select on app_config
  for select to authenticated using (true);

-- route_fares: readable by any logged-in user, no writes
create policy route_fares_select on route_fares
  for select to authenticated using (true);

-- ride_requests: own rows only; no insert/update/delete from clients
create policy ride_requests_select_own on ride_requests
  for select using (user_id = auth.uid());

-- pools: caller has an ACTIVE or LEFT membership row for that pool
create policy pools_member_select on pools
  for select using (public.can_access_pool(id));

-- pool_members: rows of pools the caller belongs to (helper avoids recursion)
create policy pool_members_pool_select on pool_members
  for select using (public.can_access_pool(pool_id));

-- notifications: own rows; clients may clear read_at only (column grant below)
create policy notifications_select_own on notifications
  for select using (user_id = auth.uid());
create policy notifications_update_own on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Privileges: start from zero, then re-grant only what the policies allow
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on profiles      to authenticated;
grant select on app_config    to authenticated;
grant select on route_fares   to authenticated;
grant select on ride_requests to authenticated;
grant select on pools         to authenticated;
grant select on pool_members  to authenticated;
grant select on notifications to authenticated;

-- column-level update grants (users cannot change role/strikes/blocked_until/email,
-- and can only set read_at on notifications)
revoke update on profiles from authenticated;
grant update (full_name, phone, share_phone) on profiles to authenticated;
grant update (read_at) on notifications to authenticated;

-- anon gets nothing at all
revoke all on all tables in schema public from anon;

-- no schema object creation by anyone but the owner
revoke create on schema public from public;

-- no function execution by default (per-function grants happen in 0003)
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables from public, anon;

-- helpers used by RLS policies must stay executable by the client role
revoke all on function public.can_access_pool(uuid) from public, anon;
grant execute on function public.can_access_pool(uuid) to authenticated;

-- D9: bound query time for the client role (verified value recorded in README)
alter role authenticated set statement_timeout = '8s';
