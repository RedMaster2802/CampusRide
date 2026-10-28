-- 0004_cron_realtime.sql — scheduled maintenance job + realtime publication
--
-- pg_cron: try the sub-minute schedule first; if the extension version on the
-- hosted project rejects it, report the exact error and use '* * * * *'.
create extension if not exists pg_cron;

select cron.schedule('gatepool-maintenance', '10 seconds',
  $$select public.run_pool_maintenance();$$);

-- Realtime: ONLY notifications is published (never pools / pool_members)
alter publication supabase_realtime add table public.notifications;
