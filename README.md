# GatePool

Campus cab-pooling app for students. Share cabs with fellow students traveling the same route.

## Architecture

- **Backend**: Supabase (PostgreSQL + Auth + Realtime + pg_cron)
- **Frontend**: React 19 + TypeScript + Vite + Tailwind 4 + React Query + React Router + React Hook Form + Zod
- **PWA**: Installable web app with offline support

## Quick Start

### Prerequisites

- Node.js 20+
- Supabase CLI (`npm install -g supabase`)
- Docker (for local Supabase)

### Local Development

1. **Start Supabase** (from repository root)
   ```bash
   supabase start
   ```

2. **Apply migrations** (from repository root)
   ```bash
   supabase db reset
   ```

3. **Configure Supabase Auth** (in Supabase Dashboard):
   - Enable Email provider with OTP
   - Set OTP expiry to 10 minutes
   - Set Site URL to `http://localhost:5173`
   - Add redirect URLs: `http://localhost:5173`, `http://localhost:5173/verify`
   - Custom SMTP (required for production)
   - Edit Magic Link email template to show `{{ .Token }}`

4. **Set app config** (in Supabase Dashboard SQL editor):
   ```sql
   update app_config set value = '"your-college.edu"' where key = 'allowed_email_domain';
   update app_config set value = '"Gate 1"' where key = 'meet_point_sector_128';
   update app_config set value = '"Gate 2"' where key = 'meet_point_sector_62';
   update app_config set value = '"Main Gate"' where key = 'meet_point_obs';
   update app_config set value = '"Metro Gate 1"' where key = 'meet_point_botanical_metro';
   ```

5. **Set route fares** (in Supabase Dashboard):
   ```sql
   update route_fares set cap4_total_inr = 200, cap6_total_inr = 300 where origin = 'SECTOR_128' and destination = 'OBS';
   -- Repeat for other routes
   ```

6. **Start frontend**
   ```bash
   cd web
   cp .env.example .env.local
   # Edit .env.local with your Supabase URL and anon key
   npm install
   npm run dev
   ```

7. **Open** http://localhost:5173

### Mock Mode (no Supabase required)

```bash
cd web
echo "VITE_USE_MOCK=true" > .env.local
npm run dev
```

## Project Structure

```
gatepool/
├── supabase/           # Backend (PostgreSQL)
│   ├── migrations/     # SQL migrations (0001-0005)
│   ├── tests/          # pgTAP tests
│   ├── loadtest/       # Load testing scripts
│   ├── seed.sql        # Demo data
│   └── config.toml     # Supabase CLI config
├── web/                # Frontend (React PWA)
│   ├── src/
│   │   ├── api/        # API layer (mock + supabase)
│   │   ├── components/ # UI components
│   │   ├── hooks/      # Custom React hooks
│   │   ├── lib/        # Utilities (time, errors, etc.)
│   │   ├── pages/      # Page components
│   │   └── types/      # TypeScript types
│   ├── public/         # Static assets
│   └── package.json
└── README.md
```

## Key Features

- **Email OTP Authentication** with college domain enforcement
- **Real-time Pool Matching** with advisory locks (no race conditions)
- **Fare Splitting** with per-seat estimates
- **Strike System** for late cancellations
- **PWA Support** with offline capability
- **IST Timezone** handling throughout

## Testing

### Backend Tests

From repository root:
```bash
supabase test db
```

### Frontend Tests

```bash
cd web
npm run test          # Vitest unit tests
npm run typecheck     # TypeScript check
npm run lint          # ESLint
```

## Deployment

### Supabase (Production)

From repository root:
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### Frontend (Vercel/Netlify/Cloudflare Pages)

- Root directory: `web`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ALLOWED_EMAIL_DOMAIN`

## Production Setup Checklist

Complete these steps before going live:

- [ ] Replace all `"xxxxxxxxx"` placeholder values in `app_config` table:
  - `allowed_email_domain` (e.g., `"your-college.edu"`)
  - `meet_point_sector_128`, `meet_point_sector_62`, `meet_point_obs`, `meet_point_botanical_metro`
- [ ] Set `route_fares` for all 12 route pairs (cap4_total_inr and cap6_total_inr)
- [ ] Enable `pg_cron` extension in Supabase Dashboard (Database → Extensions)
- [ ] Edit Auth email OTP template to show `{{ .Token }}` instead of the default magic link
- [ ] Configure custom SMTP in Supabase Dashboard (Auth → SMTP Settings)
- [ ] Set Site URL and redirect URLs in Supabase Dashboard (Auth → URL Configuration)
- [ ] Do **NOT** enable CAPTCHA until the frontend sends a captcha token (the current frontend does not)
- [ ] Set required Vercel environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_ALLOWED_EMAIL_DOMAIN`
  - (Optional) `VITE_USE_MOCK=false`

## License

MIT