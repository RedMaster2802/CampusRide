-- supabase/loadtest/pgbench_create.sql
-- pgbench script for S1: create_ride_request load test
-- Run with: pgbench -f pgbench_create.sql -c 100 -j 4 -T 60 -U postgres -d postgres -h localhost -p 54322

\set u1 random(1, 5000)
\set u2 random(1, 5000)
\set u3 random(1, 5000)
\set u4 random(1, 5000)

-- Pick random route (1 of 12)
\set r random(1, 12)
\set origin case when :r = 1 then 'SECTOR_128'
            when :r = 2 then 'SECTOR_128'
            when :r = 3 then 'SECTOR_128'
            when :r = 4 then 'SECTOR_62'
            when :r = 5 then 'SECTOR_62'
            when :r = 6 then 'SECTOR_62'
            when :r = 7 then 'OBS'
            when :r = 8 then 'OBS'
            when :r = 9 then 'OBS'
            when :r = 10 then 'BOTANICAL_METRO'
            when :r = 11 then 'BOTANICAL_METRO'
            else 'BOTANICAL_METRO' end
\set dest case when :r = 1 then 'OBS'
            when :r = 2 then 'BOTANICAL_METRO'
            when :r = 3 then 'SECTOR_62'
            when :r = 4 then 'SECTOR_128'
            when :r = 5 then 'OBS'
            when :r = 6 then 'BOTANICAL_METRO'
            when :r = 7 then 'SECTOR_128'
            when :r = 8 then 'SECTOR_62'
            when :r = 9 then 'BOTANICAL_METRO'
            when :r = 10 then 'SECTOR_128'
            when :r = 11 then 'SECTOR_62'
            else 'OBS' end

-- Party size 1-3, target 4/6/ANY
\set party 1 + random(0, 2)
\set targ random(0, 2)
\set target case when :targ = 0 then '4' when :targ = 1 then '6' else 'ANY' end

-- Window: start now to 3 hours ahead, length 30-180 min
\set start_min random(0, 180)
\set len_min 30 + random(0, 150)

-- We need to authenticate as the user. pgbench doesn't support JWT easily.
-- This script is for reference; actual load test uses k6 with JWTs.

select 1;