-- _auth_shim.sql — LOCAL VERIFICATION HARNESS ONLY.
--
-- Mimics the two pieces of the Supabase platform that GatePool migrations
-- depend on, so the migrations can be verified on a vanilla PostgreSQL
-- (portable Postgres 17.6, no Docker / Supabase stack on this machine):
--
--   auth.users  — the auth schema user table (profiles references it; the
--                 signup triggers attach to it)
--   auth.uid()  — reads the JWT subject from the request.jwt.claims GUC,
--                 exactly like Supabase's own helper
--
-- On the real stack this file must NEVER be applied: Supabase provides both.
-- Every definition below is guarded so running it against the real stack
-- would be a no-op, but the guard exists for safety only.

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'auth' and tablename = 'users') then
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      aud text not null default 'authenticated',
      role text not null default 'authenticated',
      email text unique,
      encrypted_password text,
      email_confirmed_at timestamptz,
      last_sign_in_at timestamptz,
      raw_app_meta_data jsonb not null default '{}',
      raw_user_meta_data jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $fn$
      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $body$
        select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
      $body$
    $fn$;
  end if;
end $$;

-- Supabase platform roles (present on the hosted stack; created here so the
-- grant/revoke statements in the migrations resolve).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $$;
