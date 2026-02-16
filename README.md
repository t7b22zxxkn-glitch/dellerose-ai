# DelleRose.ai (MVP v1.0)

One Idea. Every Platform.

Structured multi-agent social media orchestration built with Next.js App Router,
Supabase and strict Zod validation.

## Stack

- Next.js 16 (App Router) + TypeScript strict mode
- Tailwind CSS + shadcn/ui + Lucide React
- Supabase (PostgreSQL + Auth) via Server Actions
- Zod schemas for all critical domain structures

## Local setup

1. Install dependencies:

```bash
pnpm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Fill `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OPENAI_API_KEY=...
```

Optional for local development without login:

```bash
DELLEROSE_DEV_USER_ID=<uuid-from-auth.users>
```

4. Run SQL schema in Supabase:

- File: `supabase/schema.sql`

5. Start app:

```bash
pnpm dev
```

Open `http://localhost:3000/onboarding` to run Brand Profile onboarding.
Open `http://localhost:3000/brain-dump` to run voice Brain Dump.
Open `http://localhost:3000/creative-room` for review and editing.
Open `http://localhost:3000/scheduler` for scheduling flow.

## Supabase + Vercel setup

Supabase and Vercel CLIs are configured in this project, but both services
still require authenticated login before linking/deploying:

```bash
pnpm run supabase:login
pnpm run supabase:link
pnpm run supabase:push

pnpm run vercel:login
pnpm run vercel:link
pnpm run vercel:env:pull
pnpm run vercel:deploy
```

If you use token-based auth in CI, set `SUPABASE_ACCESS_TOKEN` and
`VERCEL_TOKEN` in your environment.

## Current MVP modules

- ✅ BrandProfile onboarding flow (implemented)
- ✅ Brain Dump (voice + whisper + Master Agent brief)
- ✅ Master Agent via Server Action (typed ContentBrief)
- ✅ Multi-agent generation engine (5 platform agents + parallel orchestration)
- ✅ Creative Room (chat-log + editable preview cards + regenerate + approve)
- ✅ Scheduler list flow (pending → scheduled → posted + manual copy fallback)
- ✅ Supabase persistence for approved/scheduled/post status updates
- ✅ Rehydration from Supabase on Creative Room/Scheduler load

## Architecture

See `docs/architecture.md` for folder structure and module boundaries.
