-- 0001_schema.sql
-- GatePool database schema (CONTRACT v1.2 section 5 + v1.1 additions)

-- Enums
create type place as enum ('SECTOR_128','SECTOR_62','OBS','BOTANICAL_METRO');
create type target_pref   as enum ('4','6','ANY');
create type request_status as enum ('SEARCHING','MATCHED','EXPIRED','CANCELLED','COMPLETED');
create type pool_status    as enum ('OPEN','CONFIRMED','CANCELLED','COMPLETED');
create type member_status  as enum ('ACTIVE','LEFT');

-- Profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  phone text,
  share_phone boolean not null default false,
  strikes int not null default 0,
  blocked_until timestamptz,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

-- App config (single source of truth for all tunables)
create table app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Route fares (12 rows, one per ordered pair of different places)
create table route_fares (
  origin place not null,
  destination place not null,
  cap4_total_inr int not null default 0 check (cap4_total_inr >= 0),
  cap6_total_inr int not null default 0 check (cap6_total_inr >= 0),
  updated_at timestamptz not null default now(),
  primary key (origin, destination),
  check (origin <> destination)
);

-- Insert 12 route_fares rows (all fares default to 0)
insert into route_fares (origin, destination)
select a, b
from unnest(enum_range(null::place)) a,
     unnest(enum_range(null::place)) b
where a <> b;

-- Pools
create table pools (
  id uuid primary key default gen_random_uuid(),
  origin place not null,
  destination place not null,
  capacity smallint not null check (capacity in (4,6)),
  status pool_status not null default 'OPEN',
  window_start timestamptz not null,
  window_end timestamptz not null,
  meet_at timestamptz,
  seats_taken smallint not null default 0,
  booker_user_id uuid references profiles(id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  check (window_end > window_start),
  check (origin <> destination),
  check (seats_taken >= 0 and seats_taken <= capacity)
);

-- Ride requests
create table ride_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  origin place not null,
  destination place not null,
  party_size smallint not null check (party_size between 1 and 5),
  target target_pref not null default '4',
  window_start timestamptz not null,
  window_end timestamptz not null,
  status request_status not null default 'SEARCHING',
  pool_id uuid references pools(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_end > window_start),
  check (origin <> destination)
);
create unique index one_active_request_per_user on ride_requests(user_id)
  where status in ('SEARCHING','MATCHED');

-- Pool members
create table pool_members (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id),
  request_id uuid not null unique references ride_requests(id),
  user_id uuid not null references profiles(id),
  seats smallint not null check (seats between 1 and 5),
  status member_status not null default 'ACTIVE',
  arrived boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);
create unique index one_active_membership_per_user on pool_members(user_id)
  where status = 'ACTIVE';

-- Notifications
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- V1.1 additions: constraints, rate limits, audit log
alter table profiles add constraint profiles_name_chk
  check (full_name = '' or full_name ~ '^[[:alpha:] .''-]{2,60}$');
alter table profiles add constraint profiles_phone_chk
  check (phone is null or phone ~ '^[0-9]{10}$');

create table api_rate_limits (
  user_id uuid not null,
  action text not null,
  bucket_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, action, bucket_start)
);

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  entity text,
  entity_id uuid,
  detail jsonb not null default '{}'
);

-- Indexes
create index pools_open_idx on pools(origin, destination, capacity, created_at) where status = 'OPEN';
create index requests_queue_idx on ride_requests(origin, destination, created_at)
  where status = 'SEARCHING' and pool_id is null;

-- Additional indexes per AGENT_BACKEND section 2
create index on pools(origin, destination, status);
create index on pools(status, window_end);
create index on ride_requests(status);
create index on ride_requests(pool_id);
create index on pool_members(pool_id) where status = 'ACTIVE';
create index on notifications(user_id, created_at desc);
create index on audit_log(at);
create index on api_rate_limits(bucket_start);

-- Seed app_config with all keys from CONTRACT section 4
insert into app_config (key, value) values
  ('min_window_minutes', '30'),
  ('max_window_minutes', '180'),
  ('max_advance_minutes', '1440'),
  ('min_overlap_minutes', '15'),
  ('fallback_lead_minutes', '10'),
  ('fallback_min_seats_cap4', '3'),
  ('fallback_min_seats_cap6', '4'),
  ('lock_minutes_before_meet', '10'),
  ('cancel_grace_minutes', '2'),
  ('strike_block_threshold', '3'),
  ('strike_block_days', '7'),
  ('complete_after_minutes', '180'),
  ('allowed_email_domain', '"xxxxxxxxx"'),
  ('meet_point_sector_128', '"xxxxxxxxx"'),
  ('meet_point_sector_62', '"xxxxxxxxx"'),
  ('meet_point_obs', '"xxxxxxxxx"'),
  ('meet_point_botanical_metro', '"xxxxxxxxx"'),
  ('matcher_batch_size', '100'),
  ('rl_create_per_min', '5'),
  ('rl_cancel_per_min', '5'),
  ('rl_other_per_min', '30'),
  ('maintenance_mode', 'false'),
  ('stats_min_count', '3'),
  ('history_retention_days', '90'),
  ('audit_retention_days', '180'),
  ('last_purge_at', 'null')
on conflict (key) do nothing;

-- Lowercase email trigger
create or replace function profiles_lowercase_email()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.email := lower(new.email);
  return new;
end $$;

create trigger profiles_lowercase_email
before insert on profiles
for each row execute function profiles_lowercase_email();

-- Audit trigger on app_config
create or replace function audit_config_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'CONFIG_CHANGED', 'app_config', null, jsonb_build_object('key', new.key, 'old', null, 'new', new.value));
  elsif tg_op = 'UPDATE' then
    insert into audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'CONFIG_CHANGED', 'app_config', null, jsonb_build_object('key', new.key, 'old', old.value, 'new', new.value));
  end if;
  return new;
end $$;

create trigger audit_config_change
after insert or update on app_config
for each row execute function audit_config_change();