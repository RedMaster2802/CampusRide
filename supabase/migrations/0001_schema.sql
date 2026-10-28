-- 0001_schema.sql — GatePool schema (CONTRACT.md section 5 + v1.1 additions)
-- All names, types and constraints are reproduced exactly from the contract.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type place as enum ('SECTOR_128','SECTOR_62','OBS','BOTANICAL_METRO');
create type target_pref   as enum ('4','6','ANY');
create type request_status as enum ('SEARCHING','MATCHED','EXPIRED','CANCELLED','COMPLETED');
create type pool_status    as enum ('OPEN','CONFIRMED','CANCELLED','COMPLETED');
create type member_status  as enum ('ACTIVE','LEFT');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
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

create table app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table route_fares (
  origin place not null,
  destination place not null,
  cap4_total_inr int not null default 0 check (cap4_total_inr >= 0),
  cap6_total_inr int not null default 0 check (cap6_total_inr >= 0),
  updated_at timestamptz not null default now(),
  primary key (origin, destination),
  check (origin <> destination)
);
-- 12 rows (every ordered pair of different places), all fares 0 until the admin sets them
insert into route_fares(origin,destination)
select a, b
from unnest(enum_range(null::place)) a,
     unnest(enum_range(null::place)) b
where a <> b;

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

-- ---------------------------------------------------------------------------
-- v1.1 additions (CONTRACT "Added in v1.1")
-- ---------------------------------------------------------------------------
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
  action text not null,   -- closed list: STRIKE_ADDED, USER_BLOCKED, LATE_CANCEL, RATE_LIMITED, CONFIG_CHANGED
  entity text,
  entity_id uuid,
  detail jsonb not null default '{}'
);

-- ---------------------------------------------------------------------------
-- Indexes (AGENT_BACKEND section 2 + CONTRACT v1.1 partial indexes)
-- ---------------------------------------------------------------------------
create index pools_origin_destination_status_idx on pools(origin, destination, status);
create index pools_status_window_end_idx on pools(status, window_end);
create index ride_requests_status_idx on ride_requests(status);
create index ride_requests_pool_id_idx on ride_requests(pool_id);
create index pool_members_pool_active_idx on pool_members(pool_id) where status = 'ACTIVE';
create index notifications_user_created_idx on notifications(user_id, created_at desc);
create index audit_log_at_idx on audit_log(at);
create index api_rate_limits_bucket_idx on api_rate_limits(bucket_start);

create index pools_open_idx on pools(origin, destination, capacity, created_at) where status = 'OPEN';
create index requests_queue_idx on ride_requests(origin, destination, created_at)
  where status = 'SEARCHING' and pool_id is null;

-- ---------------------------------------------------------------------------
-- app_config seed (CONTRACT section 4; values are jsonb)
-- `last_purge_at` (jsonb null) is the maintenance purge bookkeeping key
-- ---------------------------------------------------------------------------
insert into app_config(key, value) values
  ('min_window_minutes',        '30'),
  ('max_window_minutes',        '180'),
  ('max_advance_minutes',       '1440'),
  ('min_overlap_minutes',       '15'),
  ('fallback_lead_minutes',     '10'),
  ('fallback_min_seats_cap4',   '3'),
  ('fallback_min_seats_cap6',   '4'),
  ('lock_minutes_before_meet',  '10'),
  ('cancel_grace_minutes',      '2'),
  ('strike_block_threshold',    '3'),
  ('strike_block_days',         '7'),
  ('complete_after_minutes',    '180'),
  ('allowed_email_domain',      '"xxxxxxxxx"'),
  ('meet_point_sector_128',     '"xxxxxxxxx"'),
  ('meet_point_sector_62',      '"xxxxxxxxx"'),
  ('meet_point_obs',            '"xxxxxxxxx"'),
  ('meet_point_botanical_metro','"xxxxxxxxx"'),
  ('matcher_batch_size',        '100'),
  ('rl_create_per_min',         '5'),
  ('rl_cancel_per_min',         '5'),
  ('rl_other_per_min',          '30'),
  ('maintenance_mode',          'false'),
  ('stats_min_count',           '3'),
  ('history_retention_days',    '90'),
  ('audit_retention_days',      '180'),
  ('last_purge_at',             'null');

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Audit every app_config change (CONFIG_CHANGED, old+new value in detail).
-- `last_purge_at` is machine bookkeeping written hourly by the maintenance
-- job, not a human config change, so it is exempted to keep the audit log clean.
create or replace function public.audit_config_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.key = 'last_purge_at' then
    return new;
  end if;
  insert into audit_log(actor, action, entity, entity_id, detail)
  values (auth.uid(), 'CONFIG_CHANGED', 'app_config', null,
          jsonb_build_object('key', new.key, 'old', old.value, 'new', new.value));
  return new;
end;
$$;

create trigger app_config_audit
  after insert or update on app_config
  for each row execute function public.audit_config_change();

-- Store emails lowercase
create or replace function public.lowercase_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.email := lower(new.email);
  return new;
end;
$$;

create trigger profiles_lowercase_email
  before insert or update on profiles
  for each row execute function public.lowercase_profile_email();
