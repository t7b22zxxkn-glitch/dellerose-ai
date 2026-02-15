# DelleRose.ai – Architecture (MVP v1.0)

## Confirmed stack

- **Frontend:** Next.js App Router + TypeScript (strict) + Tailwind CSS
- **UI:** shadcn/ui (Radix primitives) + Lucide React
- **Backend:** Supabase (PostgreSQL, Auth, Realtime) + Next Server Actions
- **AI orchestration:** OpenAI + Vercel AI SDK + Zod validated agent outputs
- **Hosting:** Vercel

## Proposed folder structure (App Router aligned)

```text
src/
  app/
    (marketing)/
      page.tsx
    onboarding/
      page.tsx
    brain-dump/
      page.tsx
    creative-room/
      page.tsx
    scheduler/
      page.tsx
    api/
      brain-dump/
        transcribe/route.ts
    layout.tsx
    globals.css

  features/
    agent-engine/
      actions.ts
    onboarding/
      actions.ts
      schema.ts
      service.ts
      types.ts
      components/
        onboarding-form.tsx
    brain-dump/
      actions.ts
      components/
        brain-dump-studio.tsx
      hooks/
        use-brain-dump-recorder.ts
      schema.ts
      service.ts
    creative-room/
      components/
      service.ts
    scheduler/
      components/
      service.ts

  lib/
    agents/
      shared.ts
      master.ts
      linkedin.ts
      tiktok.ts
      instagram.ts
      facebook.ts
      twitter.ts
    schemas/
      domain.ts
      database.ts
      agent-prompts.ts
    supabase/
      config.ts
      server.ts
      browser.ts
    types/
      domain.ts
    utils.ts
```

## Agent boundaries

- **Master Agent:** Produces a validated `ContentBrief`.
- **Platform agents:** Consume `ContentBrief + BrandProfile`, return validated `AgentOutput`.
- **No agent can return free-form unvalidated text** for persistence.
- **Retry policy:** If platform output fails Zod validation, agent retries exactly once.

## MVP workflow

1. Onboarding captures and stores `BrandProfile`.
2. Brain Dump records voice and transcribes with Whisper (`whisper-1`).
3. Master Agent extracts intent and creates `ContentBrief`.
4. Platform agents generate drafts in parallel (`Promise.all`) with one validation-retry.
5. Creative Room enables review, regenerate per platform, and approval.
6. Scheduler stores post plans with simple status progression.
