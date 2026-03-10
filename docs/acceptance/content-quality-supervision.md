# Content quality supervision checklist

Use this checklist to verify supervisor angles and diversity guardrails before go-live.

## Preconditions

- [ ] Brain Dump completed with a valid brief
- [ ] Platform drafts generated successfully
- [ ] Creative Room quality review panel is visible

## 1) Supervisor angle presence

Expected:

- [ ] Quality review shows `global direction`
- [ ] Quality review shows one angle per platform
- [ ] Supervisor prompt version is visible

## 2) Cross-platform diversity

Expected:

- [ ] Similarity pairs are shown in quality review
- [ ] High-overlap pairs are flagged (warning)
- [ ] At least one platform can be auto-adjusted by diversity guardrail when overlap is high

## 3) Angle alignment flags

Expected:

- [ ] Drafts that weakly reflect their platform angle receive `low_angle_alignment` flags
- [ ] Flags include platform and actionable message

## 4) Regenerate with instruction

Steps:

1. Open any platform card in Creative Room
2. Enter a regenerate instruction
3. Click **Regenerate med instruction**

Expected:

- [ ] Draft updates successfully
- [ ] Instruction is reflected in the regenerated output tone/focus
- [ ] Existing persistence flow remains intact

## 5) Re-score after manual changes

Expected:

- [ ] Quality review can be recalculated after manual edits/regeneration
- [ ] Similarity pairs and flags refresh based on latest draft text
- [ ] Supervisor angles remain visible in updated report

## 6) Regression safety

Expected:

- [ ] Scheduler flow still works (`pending -> scheduled -> posted`)
- [ ] Manual fallback copy is unaffected
- [ ] `pnpm lint` and `pnpm build` pass
