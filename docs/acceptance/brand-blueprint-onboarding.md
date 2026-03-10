# Brand Blueprint onboarding checklist

Use this checklist to validate Brand Blueprint before go-live.

## Preconditions

- [ ] User is authenticated
- [ ] Microphone permissions are enabled
- [ ] Supabase schema includes `brand_blueprints`

## 1) Interview UX

- [ ] User can choose onboarding path option
- [ ] UI shows one question at a time (3 total)
- [ ] User can record answer for each question
- [ ] Progress and loading states are clear on mobile

## 2) Transcription + analysis

- [ ] Each recording is transcribed successfully
- [ ] Analysis runs after all 3 answers are present
- [ ] User receives structured Brand Blueprint output

## 3) Output quality

- [ ] Output includes niche, audience, tone, traits, 3 pillars, elevator pitch, bio
- [ ] Niche and audience are specific (not generic placeholders)
- [ ] Exactly 3 content pillars are generated

## 4) Result actions

- [ ] User can approve blueprint
- [ ] User can regenerate blueprint
- [ ] User can manually edit and save blueprint

## 5) Persistence + context usage

- [ ] Brand Blueprint persists in `brand_blueprints`
- [ ] Approved blueprint is loaded in onboarding bootstrap
- [ ] Blueprint context is injected into Master Agent and Platform Agent prompts

## 6) Regression safety

- [ ] Existing Brain Dump flow still works
- [ ] Existing Creative Room and Scheduler flows still work
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
