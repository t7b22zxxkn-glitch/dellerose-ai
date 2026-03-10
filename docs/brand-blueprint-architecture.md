# Brand Blueprint module structure

```text
src/
  app/
    brand-blueprint/
      page.tsx
  features/
    brand-blueprint/
      actions.ts
      constants.ts
      schema.ts
      service.ts
      types.ts
      hooks/
        use-brand-blueprint-studio.ts
      components/
        brand-blueprint-studio.tsx
  lib/
    agents/
      brand-architect.ts
      prompts/
        brand-architect.ts
    brand-blueprint/
      context.ts
```

## Responsibilities

- `page.tsx`: route-level orchestration and auth guard.
- `actions.ts`: server actions for analyze/save/approve flow.
- `service.ts`: database persistence and bootstrap queries.
- `schema.ts`: strict input validation contracts.
- `hooks/use-brand-blueprint-studio.ts`: client-side interview state machine.
- `components/brand-blueprint-studio.tsx`: UI flow and result presentation.
- `lib/agents/brand-architect.ts`: LLM analysis with strict schema output.
- `lib/agents/prompts/brand-architect.ts`: dedicated Brand Architect prompts.
- `lib/brand-blueprint/context.ts`: reusable context formatter for future idea generation.
