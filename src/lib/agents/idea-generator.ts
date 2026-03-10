import "server-only"

import { generateObject } from "ai"
import { z } from "zod"

import { createOpenAIProvider } from "@/lib/ai/provider"
import { buildBrandBlueprintPromptContext } from "@/lib/brand-blueprint/context"
import { platformSchema } from "@/lib/schemas/domain"
import type { BrandBlueprint, Platform } from "@/lib/types/domain"

import {
  IDEA_GENERATOR_PROMPT_VERSION,
  IDEA_GENERATOR_SYSTEM_PROMPT,
} from "@/lib/agents/prompts/idea-generator"

const ideaItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  angle: z.string().trim().min(1).max(200),
  suggestedPlatform: platformSchema,
  hook: z.string().trim().min(1).max(180),
  rationale: z.string().trim().min(1).max(220),
})

const pillarIdeasSchema = z.object({
  pillarTitle: z.string().trim().min(1).max(120),
  ideas: z.array(ideaItemSchema).min(3).max(5),
})

export const ideaGeneratorOutputSchema = z.object({
  promptVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  pillarIdeas: z.array(pillarIdeasSchema).length(3),
})

export type IdeaGeneratorOutput = z.infer<typeof ideaGeneratorOutputSchema>

const platformRotation: Platform[] = [
  "linkedin",
  "instagram",
  "tiktok",
  "facebook",
  "twitter",
]

export function buildFallbackIdeas(
  blueprint: BrandBlueprint,
  ideasPerPillar: number
): IdeaGeneratorOutput {
  const nextIdeasPerPillar = Math.max(3, Math.min(5, ideasPerPillar))

  const pillarIdeas = blueprint.contentPillars.map((pillar, pillarIndex) => {
    const ideas = Array.from({ length: nextIdeasPerPillar }).map((_, ideaIndex) => {
      const platform = platformRotation[(pillarIndex + ideaIndex) % platformRotation.length]
      return {
        title: `${pillar.title}: idé ${ideaIndex + 1}`,
        angle: `Vis en konkret vinkel på "${pillar.description}" målrettet ${blueprint.audience}.`,
        suggestedPlatform: platform,
        hook: `Det de fleste misforstår om ${pillar.title.toLowerCase()}...`,
        rationale: `Matcher niche "${blueprint.niche}" og tone "${blueprint.brandTone}".`,
      }
    })

    return {
      pillarTitle: pillar.title,
      ideas,
    }
  })

  return ideaGeneratorOutputSchema.parse({
    promptVersion: IDEA_GENERATOR_PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
    pillarIdeas,
  })
}

export async function generateIdeasFromBlueprint(input: {
  blueprint: BrandBlueprint
  ideasPerPillar: number
}): Promise<IdeaGeneratorOutput> {
  const openai = createOpenAIProvider()
  const boundedIdeasPerPillar = Math.max(3, Math.min(5, input.ideasPerPillar))

  const dynamicSchema = z.object({
    promptVersion: z.literal(IDEA_GENERATOR_PROMPT_VERSION),
    generatedAt: z.string().datetime(),
    pillarIdeas: z
      .array(
        z.object({
          pillarTitle: z.string().trim().min(1).max(120),
          ideas: z.array(ideaItemSchema).length(boundedIdeasPerPillar),
        })
      )
      .length(3),
  })

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: dynamicSchema,
    temperature: 0.45,
    system: IDEA_GENERATOR_SYSTEM_PROMPT,
    prompt: `
Prompt version: ${IDEA_GENERATOR_PROMPT_VERSION}

Generér ${boundedIdeasPerPillar} konkrete idéer for hver af de 3 content pillars.
Hver idé skal have:
- title
- angle
- suggestedPlatform
- hook
- rationale

Brand Blueprint:
${buildBrandBlueprintPromptContext(input.blueprint)}
`.trim(),
  })

  return ideaGeneratorOutputSchema.parse(object)
}
