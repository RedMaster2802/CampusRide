-- supabase/loadtest/users.sql
-- Load test user generation (run once to create test users)

-- This creates 5000 test users for load testing
-- Run with: psql -f users.sql postgresql://postgres:postgres@localhost:54322/postgres

do $$
declare
  i int;
  v_uid uuid;
begin
  for i in 1..5000 loop
    v_uid := gen_random_uuid();
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, 'load' || i || '@example.edu', 'test', now(), '{"provider":"email"}', '{}', now(), now())
    on conflict (email) do nothing;
    insert into profiles (id, email, full_name) values (v_uid, 'load' || i || '@example.edu', 'Load User ' || i)
    on conflict (id) do nothing;
  end loop;
end $$;

-- Verify
select count(*) as user_count from profiles;