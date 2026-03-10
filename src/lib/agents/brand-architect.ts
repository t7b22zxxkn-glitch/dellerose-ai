import "server-only"

import { generateObject } from "ai"

import { brandBlueprintSchema } from "@/lib/schemas/domain"
import type { BrandBlueprint } from "@/lib/types/domain"

import {
  BRAND_ARCHITECT_PROMPT_VERSION,
  BRAND_ARCHITECT_SYSTEM_PROMPT,
  buildBrandArchitectPrompt,
} from "@/lib/agents/prompts/brand-architect"
import { createOpenAIProvider } from "@/lib/ai/provider"

export async function generateBrandBlueprintFromInterview(input: {
  interviewAnswers: string[]
  interviewTranscript: string
}): Promise<{
  promptVersion: string
  blueprint: BrandBlueprint
}> {
  const openai = createOpenAIProvider()

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: brandBlueprintSchema,
    temperature: 0.35,
    system: BRAND_ARCHITECT_SYSTEM_PROMPT,
    prompt: buildBrandArchitectPrompt(input),
  })

  return {
    promptVersion: BRAND_ARCHITECT_PROMPT_VERSION,
    blueprint: object,
  }
}

export function buildFallbackBrandBlueprint(input: {
  interviewAnswers: string[]
  interviewTranscript: string
}): {
  promptVersion: string
  blueprint: BrandBlueprint
} {
  const firstAnswer = input.interviewAnswers[0] ?? input.interviewTranscript
  const secondAnswer = input.interviewAnswers[1] ?? input.interviewTranscript
  const thirdAnswer = input.interviewAnswers[2] ?? input.interviewTranscript

  return {
    promptVersion: BRAND_ARCHITECT_PROMPT_VERSION,
    blueprint: brandBlueprintSchema.parse({
      niche: firstAnswer.slice(0, 160) || "Praktisk vidensdeling fra egen erfaring",
      audience:
        thirdAnswer.slice(0, 160) || "Ambitiøse fagpersoner, der vil løse et konkret problem",
      brandTone: "Direkte, jordnær og handlingsorienteret",
      personalityTraits: ["direkte", "pædagogisk", "troværdig"],
      contentPillars: [
        {
          title: "Fejl og læring",
          description: secondAnswer.slice(0, 200) || "Typiske fejl og hvordan de undgås.",
        },
        {
          title: "Praktiske metoder",
          description:
            firstAnswer.slice(0, 200) || "Konkrete metoder, frameworks og arbejdsgange.",
        },
        {
          title: "Målgruppeproblemer",
          description:
            thirdAnswer.slice(0, 200) || "Kerneproblemer for målgruppen og konkrete løsninger.",
        },
      ],
      elevatorPitch:
        `Jeg hjælper ${thirdAnswer.slice(0, 80) || "min målgruppe"} med at tage bedre beslutninger gennem konkrete indsigter og praktiske løsninger.`.slice(
          0,
          420
        ),
      bioShort:
        `Praktisk creator om ${firstAnswer.slice(0, 80) || "faglig udvikling"} · konkrete råd · ærlig erfaring.`.slice(
          0,
          220
        ),
    }),
  }
}
