-- supabase/tests/00_setup.sql
-- Test setup: create test users and helper functions

-- Helper to set up authenticated context for a test user
create or replace function test_as_user(p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
begin
  -- Create or get test user
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), p_email, 'test', now(), '{"provider":"email"}', '{}', now(), now())
  on conflict (email) do update set email = excluded.email
  returning id into v_uid;
  
  if v_uid is null then
    select id into v_uid from auth.users where email = p_email;
  end if;
  
  -- Ensure profile exists (trigger should have created it)
  insert into profiles (id, email) values (v_uid, p_email)
  on conflict (id) do nothing;
  
  -- Set role for this session
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid)::text, true);
  perform set local role authenticated;
end $$;

-- Helper to create a ride request in tests
create or replace function test_create_request(
  p_user_email text, p_origin place, p_destination place,
  p_party_size int, p_target target_pref,
  p_window_start timestamptz, p_window_end timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform test_as_user(p_user_email);
  return create_ride_request(p_origin, p_destination, p_party_size, p_target, p_window_start, p_window_end);
end $$;

-- Helper to get active ride in tests
create or replace function test_get_active_ride(p_user_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform test_as_user(p_user_email);
  return get_active_ride();
end $$;

-- Helper to run maintenance with specific time
create or replace function test_run_maintenance(p_now timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform run_pool_maintenance(p_now);
end $$;