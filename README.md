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

## Current MVP modules

- ✅ BrandProfile onboarding flow (implemented)
- 🔜 Brain Dump (voice + whisper)
- 🔜 Multi-agent generation engine
- 🔜 Creative Room preview and editing
- 🔜 Scheduler list flow (pending → scheduled → posted)

## Architecture

See `docs/architecture.md` for folder structure and module boundaries.
