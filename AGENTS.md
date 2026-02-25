# AGENTS.md

## Cursor Cloud specific instructions

### Overview

DelleRose.ai is a single Next.js 16 application (not a monorepo) using **pnpm** as its package manager. It is a multi-agent social media orchestration platform with Danish-language UI.

### Common commands

See `package.json` `scripts` for the full list. Key ones:

| Task | Command |
|------|---------|
| Dev server | `pnpm dev` (port 3000) |
| Lint | `pnpm lint` |
| Build | `pnpm build` |
| Smoke test (mocked) | `pnpm run test:brain-dump` |

### External service dependencies

The app requires **Supabase** (auth + database) and **OpenAI** (AI agents) API keys configured in `.env.local`. Without valid Supabase credentials, auth-protected routes redirect to `/login` with a config-missing notice; the homepage and login page still render.

### Dev user fallback

Set `ENABLE_DEV_USER_FALLBACK=true` and `DELLEROSE_DEV_USER_ID=<uuid>` in `.env.local` to bypass Supabase Auth during local development. This still requires a valid Supabase URL/key to create the server client; it only skips the auth check.

### Environment file

Copy `.env.example` to `.env.local` and fill in values. The Supabase config is validated with Zod (`z.string().url()` for URL, `z.string().min(1)` for anon key). If the env vars are missing or invalid, `isSupabaseConfigured()` returns `false` and the app degrades gracefully.

### Build scripts warning

After `pnpm install`, pnpm may warn about ignored build scripts for `esbuild` and `msw`. These are configured in `pnpm-workspace.yaml` under `ignoredBuiltDependencies` and do not affect normal development.

### No git hooks or pre-commit config

This repository has no `.husky/`, `.pre-commit-config.yaml`, or `lint-staged` configuration.
