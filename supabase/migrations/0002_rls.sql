-- 0002_rls.sql
-- Row Level Security policies (CONTRACT v1.2 section 5 + AGENT_BACKEND section 2)

-- Enable RLS on all tables
alter table profiles enable row level security;
alter table app_config enable row level security;
alter table route_fares enable row level security;
alter table pools enable row level security;
alter table ride_requests enable row level security;
alter table pool_members enable row level security;
alter table notifications enable row level security;
alter table api_rate_limits enable row level security;
alter table audit_log enable row level security;

-- Profiles: select own, update own (only full_name, phone, share_phone)
create policy profiles_select_own on profiles for select using (id = auth.uid());
create policy profiles_update_own on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Revoke update on sensitive columns, then grant only allowed columns
revoke update on profiles from authenticated;
grant update (full_name, phone, share_phone) on profiles to authenticated;

-- App config: select for authenticated
create policy app_config_select on app_config for select to authenticated using (true);

-- Route fares: select for authenticated
create policy route_fares_select on route_fares for select to authenticated using (true);

-- Ride requests: select own only
create policy ride_requests_select_own on ride_requests for select using (user_id = auth.uid());

-- Pools: select where caller has ACTIVE or LEFT membership
create policy pools_select_member on pools for select using (
  exists (
    select 1 from pool_members pm
    where pm.pool_id = pools.id
      and pm.user_id = auth.uid()
      and pm.status in ('ACTIVE','LEFT')
  )
);

-- Pool members: select rows whose pool_id caller belongs to
create policy pool_members_select_member on pool_members for select using (
  exists (
    select 1 from pool_members pm2
    where pm2.pool_id = pool_members.pool_id
      and pm2.user_id = auth.uid()
      and pm2.status in ('ACTIVE','LEFT')
  )
);

-- Notifications: select own, update own read_at
create policy notifications_select_own on notifications for select using (user_id = auth.uid());
create policy notifications_update_read on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on notifications from authenticated;
grant update (read_at) on notifications to authenticated;

-- api_rate_limits and audit_log: no policies (only owner/service role can access)

-- Revoke all default privileges
revoke all on all tables in schema public from anon, authenticated;

-- Re-grant only what policies allow
grant select on profiles to authenticated;
grant select on app_config to authenticated;
grant select on route_fares to authenticated;
grant select on ride_requests to authenticated;
grant select on pools to authenticated;
grant select on pool_members to authenticated;
grant select on notifications to authenticated;

-- anon gets nothing
-- revoke create on schema public from public
revoke create on schema public from public;

-- Revoke execute on all functions from public, anon
revoke execute on all functions in schema public from public, anon;

-- Default privileges: prevent auto-grants on future functions
alter default privileges in schema public revoke execute on functions from public, anon;

-- Verify privileges (run after 0003_functions.sql as well)
-- select * from information_schema.table_privileges where table_schema = 'public' and grantee in ('anon','authenticated') order by table_name, grantee;
-- select * from information_schema.routine_privileges where routine_schema = 'public' and grantee in ('anon','authenticated') order by routine_name, grantee;