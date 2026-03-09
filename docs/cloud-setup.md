# Cloud setup checklist (Supabase + Vercel)

This project is prepared for Supabase and Vercel, but service login is still
required in your own account context.

## 1) Supabase

From `dellerose-ai/`:

```bash
pnpm run supabase:login
pnpm run supabase:link
pnpm run supabase:push
```

Notes:

- `supabase:link` expects `SUPABASE_PROJECT_REF` in your environment.
- Database schema source is `supabase/schema.sql` (wired in `supabase/config.toml`).

## 2) Vercel

From `dellerose-ai/`:

```bash
pnpm run vercel:login
pnpm run vercel:link
pnpm run vercel:env:pull
pnpm run vercel:deploy
```

Recommended Vercel project settings:

- Framework: Next.js
- Root Directory: repository root (for standalone `dellerose-ai` repo)
- Build command: `pnpm build`
- Install command: `pnpm install --frozen-lockfile`

Required Vercel env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for scheduler worker)
- `OPENAI_API_KEY`
- `BRAIN_DUMP_SMOKE_KEY` (optional but recommended for smoke endpoint auth)
- `SCHEDULER_WORKER_KEY` (optional for manual worker triggers)
- `CRON_SECRET` (recommended for Vercel cron auth)
- `ENABLE_DEV_USER_FALLBACK` + `DELLEROSE_DEV_USER_ID` (optional local-only fallback)

Scheduler worker endpoint:

- `GET /api/scheduler/publish-worker`
- `POST /api/scheduler/publish-worker`

Auth options:

- Header `Authorization: Bearer <CRON_SECRET>`
- Header `x-worker-key: <SCHEDULER_WORKER_KEY>`

## 3) Verification

After linking:

1. Run `pnpm build` locally.
2. Deploy preview on Vercel.
3. Verify:
   - `/login` can sign in/sign up users
   - `/onboarding` can save profile to Supabase
   - `/brain-dump` can transcribe/analyze
   - `/creative-room` can approve/plan
   - `/scheduler` can update status and persist to Supabase
   - `/api/scheduler/publish-worker?dryRun=true` returns a valid worker summary

Smoke test (from local shell):

```bash
BRAIN_DUMP_SMOKE_BASE_URL=https://your-preview-url.vercel.app \
BRAIN_DUMP_SMOKE_KEY=your_smoke_key \
pnpm run test:brain-dump:remote
```
