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
- Root Directory: `dellerose-ai` (if deploying from monorepo root)
- Build command: `pnpm build`
- Install command: `pnpm install --frozen-lockfile`

Required Vercel env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `DELLEROSE_DEV_USER_ID` (optional)

## 3) Verification

After linking:

1. Run `pnpm build` locally.
2. Deploy preview on Vercel.
3. Verify:
   - `/onboarding` can save profile to Supabase
   - `/brain-dump` can transcribe/analyze
   - `/creative-room` can approve/plan
   - `/scheduler` can update status and persist to Supabase
