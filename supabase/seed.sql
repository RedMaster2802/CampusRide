-- seed.sql
-- GatePool seed data (only app_config is seeded by migrations)
-- This file contains a documented demo block for local testing only.
-- NEVER load this in production.

-- The following block creates 12 fake users and requests for demos.
-- Uncomment and run manually in local development only.

/*
-- Ensure we have the allowed email domain set for demo
-- update app_config set value = '"example.edu"' where key = 'allowed_email_domain';

-- Create 12 demo users (requires auth.users insert which triggers profile creation)
-- In local Supabase, you can use the dashboard or SQL to create users with emails like:
-- user1@example.edu, user2@example.edu, ... user12@example.edu
-- Then run the requests below after logging in as each user.

-- Example: Create requests for different routes and scenarios
-- These would be created via the create_ride_request RPC, not direct inserts

-- Route: SECTOR_128 -> OBS (4 singles, target 4)
-- select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
-- select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
-- select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');
-- select create_ride_request('SECTOR_128', 'OBS', 1, '4', now(), now() + interval '30 minutes');

-- Route: SECTOR_62 -> BOTANICAL_METRO (2+1+1, target 4)
-- select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 2, '4', now(), now() + interval '45 minutes');
-- select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '45 minutes');
-- select create_ride_request('SECTOR_62', 'BOTANICAL_METRO', 1, '4', now(), now() + interval '45 minutes');

-- Route: OBS -> SECTOR_128 (3+1, target 4)
-- select create_ride_request('OBS', 'SECTOR_128', 3, '4', now(), now() + interval '60 minutes');
-- select create_ride_request('OBS', 'SECTOR_128', 1, '4', now(), now() + interval '60 minutes');

-- Route: SECTOR_128 -> SECTOR_62 (target 6: 3+2+1)
-- select create_ride_request('SECTOR_128', 'SECTOR_62', 3, '6', now(), now() + interval '90 minutes');
-- select create_ride_request('SECTOR_128', 'SECTOR_62', 2, '6', now(), now() + interval '90 minutes');
-- select create_ride_request('SECTOR_128', 'SECTOR_62', 1, '6', now(), now() + interval '90 minutes');

-- Route: BOTANICAL_METRO -> OBS (ANY single joining 4-seat pool with 1 seat left vs 6-seat with 3 left)
-- First create a 4-seat pool with 3 singles
-- select create_ride_request('BOTANICAL_METRO', 'OBS', 1, '4', now(), now() + interval '30 minutes');
-- select create_ride_request('BOTANICAL_METRO', 'OBS', 1, '4', now(), now() + interval '30 minutes');
-- select create_ride_request('BOTANICAL_METRO', 'OBS', 1, '4', now(), now() + interval '30 minutes');
-- Then create ANY single
-- select create_ride_request('BOTANICAL_METRO', 'OBS', 1, 'ANY', now(), now() + interval '30 minutes');

-- Set some demo fares
-- update route_fares set cap4_total_inr = 200, cap6_total_inr = 300 where origin = 'SECTOR_128' and destination = 'OBS';
-- update route_fares set cap4_total_inr = 250, cap6_total_inr = 350 where origin = 'SECTOR_62' and destination = 'BOTANICAL_METRO';

-- Run maintenance to process everything
-- select run_pool_maintenance();
*/