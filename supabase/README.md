# GatePool Backend - Supabase Setup

## Quick Start

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Start local stack (requires Docker)
supabase start

# 3. Apply migrations (runs 0001-0004 + seed)
supabase db reset

# 4. Run tests
supabase test db

# 5. Generate TypeScript types for frontend
supabase gen types typescript --local > ../web/src/types/database.ts
```

## Environment

- Local Supabase runs on Docker
- API: http://localhost:54321
- Database: postgresql://postgres:postgres@localhost:54322/postgres
- Studio: http://localhost:54323
- Inbucket (email): http://localhost:54324

## Migrations

| File | Description |
|------|-------------|
| `0001_schema.sql` | Tables, enums, indexes, app_config seed, route_fares seed |
| `0002_rls.sql` | Row Level Security policies |
| `0003_functions.sql` | All RPC functions, helpers, auth triggers |
| `0004_cron_realtime.sql` | pg_cron job + realtime publication |

Run in order with `supabase db reset`.

## Auth Configuration (Manual - do once per project)

1. **Enable Email OTP**: Supabase Dashboard → Authentication → Providers → Email → Enable "Passwordless sign in"
2. **Email Template**: Edit "Magic Link" template to show `{{ .Token }}` (6-digit code), not just a link
3. **SMTP**: Configure custom SMTP (Settings → Auth → SMTP) - built-in mailer has low limits
4. **OTP Expiry**: Set to 10 minutes or less (Settings → Auth → OTP expiry)
5. **Token Settings**: Access token ≤ 3600s, Refresh token rotation ON
6. **CAPTCHA**: Enable Cloudflare Turnstile before public launch (Settings → Auth → CAPTCHA)
7. **Statement Timeout**: Set `statement_timeout = '8s'` for `authenticated` role
8. **Site URL & Redirects**: Add your frontend URL and `http://localhost:5173`
9. **Environments**: Create 3 projects: local, staging, production

## Required Config Values (set in `app_config` via dashboard)

| Key | Description |
|-----|-------------|
| `allowed_email_domain` | College email domain (e.g., `mail.jiit.ac.in`) |
| `meet_point_sector_128` | Meeting point name for Sector 128 |
| `meet_point_sector_62` | Meeting point name for Sector 62 |
| `meet_point_obs` | Meeting point name for OBS |
| `meet_point_botanical_metro` | Meeting point name for Botanical Metro |

## Route Fares (set via dashboard)

Edit `route_fares` table: 12 rows (every ordered pair of 4 places). Set `cap4_total_inr` and `cap6_total_inr` in whole INR. 0 = not set (UI hides fare).

## Running Tests

```bash
# All pgTAP tests
supabase test db

# Individual test file
psql -f supabase/tests/01_matching_basic.sql postgresql://postgres:postgres@localhost:54322/postgres
```

## Load Testing

```bash
# 1. Create test users (run once)
psql -f supabase/loadtest/users.sql postgresql://postgres:postgres@localhost:54322/postgres

# 2. Run pgbench tests (S1, S1b, S2, S6, S7)
# See LOADTEST.md for details

# 3. Run k6 test
k6 run supabase/loadtest/k6_create.js -e SUPABASE_URL=http://localhost:54321 -e ANON_KEY=your-anon-key
```

## Deploy to Hosted Supabase

```bash
# 1. Link project
supabase link --project-ref <your-project-ref>

# 2. Push migrations
supabase db push

# 3. Configure auth settings in dashboard (same as local)
# 4. Set app_config values in dashboard
# 5. Set route_fares in dashboard
```

## RPC Reference

All RPCs called via `supabase.rpc('name', { params })`:

| RPC | Args | Returns |
|-----|------|---------|
| `create_ride_request` | origin, destination, party_size, target, window_start, window_end | `ActiveRide` |
| `get_active_ride` | none | `ActiveRide` or null |
| `cancel_ride_request` | request_id | `{ok, strike_added}` |
| `claim_booker` | pool_id | `{ok}` |
| `mark_arrived` | pool_id, arrived? | `{ok}` |
| `get_ride_history` | limit? | `HistoryItem[]` |
| `get_live_stats` | none | `LiveStat[12]` |

## Key Implementation Notes

- **All business logic in PL/pgSQL** - no Edge Functions
- **Security definer functions** with `search_path = public, pg_temp`
- **Advisory locks** for matching - `pg_try_advisory_xact_lock` (never waits)
- **Lock order**: advisory lock → pool row → request rows (pool rows by ascending id)
- **Realtime**: ONLY `notifications` table published
- **Rate limits**: Per-user per-minute via `api_rate_limits` table
- **Audit log**: All security events logged
- **Maintenance job**: Runs every 10 seconds (or 1 min fallback), handles queue drain, repack, fallback, completion, purge

## Troubleshooting

- **pg_cron sub-minute not supported**: Migration 0004 falls back to `* * * * *` (every minute)
- **Realtime not working**: Check `supabase_realtime` publication has `notifications` table
- **Auth trigger errors**: Check `auth.users` trigger `enforce_college_email` - email domain must match `allowed_email_domain`
- **Rate limit not working**: Ensure `api_rate_limits` table exists and `check_rate_limit` is called