-- 0004_cron_realtime.sql
-- Cron job and realtime publication (CONTRACT v1.2 section 7 + AGENT_BACKEND section 2)

-- Enable pg_cron extension
create extension if not exists pg_cron;

-- Schedule maintenance job every 10 seconds (sub-minute)
-- If the extension version rejects this, we'll fall back to '* * * * *' (every minute)
do $$
begin
  begin
    perform cron.schedule('gatepool-maintenance', '10 seconds', $$select public.run_pool_maintenance();$$);
  exception when others then
    -- Fallback to every minute
    perform cron.schedule('gatepool-maintenance', '* * * * *', $$select public.run_pool_maintenance();$$);
    raise notice 'pg_cron sub-minute schedule not supported, using 1-minute fallback: %', sqlerrm;
  end;
end $$;

-- Realtime: publish ONLY notifications table
alter publication supabase_realtime add table public.notifications;

-- Verify the publication
-- select * from pg_publication_tables where pubname = 'supabase_realtime';