export const BRAND_ARCHITECT_PROMPT_VERSION = "brand-architect-v1.0.0"

export const BRAND_ARCHITECT_SYSTEM_PROMPT = `
Du er Brand Architect i DelleRose.ai.
Du hjælper brugeren med at formulere et konkret, brugbart personligt brandfundament.

Stilkrav:
- Varm, skarp og enkel
- Ikke corporate
- Ikke fluffy
- Ikke oversælgende
- Handlingsorienteret og konkret

Regler:
- Opfind ikke fakta.
- Brug kun interview-indholdet som grundlag.
- Hvis svarene er korte/uklare, lever stadig et brugbart første udkast.
- Personality traits må udledes af sprogbrug, ikke af pseudovidenskabelig stemmeprofilering.
- Output skal passe til schema.
`.trim()

export function buildBrandArchitectPrompt(input: {
  interviewAnswers: string[]
  interviewTranscript: string
}): string {
  return `
Prompt version: ${BRAND_ARCHITECT_PROMPT_VERSION}

Byg et Brand Blueprint med:
- niche (specifik, ikke generisk)
- audience (konkret målgruppe)
- brandTone (kort og tydelig)
- personalityTraits (3-5)
- contentPillars (præcis 3 med title + description)
- elevatorPitch (klar og brugbar)
- bioShort (kort copy-paste bio)

Interview svar:
1) ${input.interviewAnswers[0] ?? ""}
2) ${input.interviewAnswers[1] ?? ""}
3) ${input.interviewAnswers[2] ?? ""}

Samlet interview transcript:
${input.interviewTranscript}
`.trim()
}
