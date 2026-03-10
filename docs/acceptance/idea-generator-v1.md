# Idea Generator v1 checklist

Use this checklist to validate "Giv mig en idé" before release.

## Preconditions

- [ ] User is authenticated
- [ ] User has an approved Brand Blueprint
- [ ] `/ideas` page is accessible

## 1) Generation flow

- [ ] User can choose ideas per pillar (3-5)
- [ ] Generate action returns ideas without UI errors
- [ ] Output groups ideas under each of the 3 pillars

## 2) Output quality

- [ ] Every idea includes title, angle, suggested platform, hook, rationale
- [ ] Ideas are specific and tied to pillar context
- [ ] Platform suggestions vary and are plausible

## 3) Guardrails

- [ ] Access is blocked if no approved Brand Blueprint exists
- [ ] Friendly error is shown for invalid state
- [ ] Fallback generation works if LLM call fails

## 4) Regression safety

- [ ] Brand Blueprint onboarding still works
- [ ] Brain Dump, Creative Room, Scheduler still work
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
