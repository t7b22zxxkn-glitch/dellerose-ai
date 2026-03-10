import "server-only"

import { generateObject } from "ai"
import { z } from "zod"

import { createOpenAIProvider } from "@/lib/ai/provider"
import type { BrandProfile, ContentBrief, Platform } from "@/lib/types/domain"

const SUPERVISOR_PROMPT_VERSION = "supervisor-v1.0.0"

const supervisorSchema = z.object({
  globalDirection: z.string().trim().min(1).max(320),
  platformAngles: z.object({
    linkedin: z.string().trim().min(1).max(180),
    tiktok: z.string().trim().min(1).max(180),
    instagram: z.string().trim().min(1).max(180),
    facebook: z.string().trim().min(1).max(180),
    twitter: z.string().trim().min(1).max(180),
  }),
})

export type SupervisorGuidance = z.infer<typeof supervisorSchema> & {
  promptVersion: typeof SUPERVISOR_PROMPT_VERSION
}

function buildFallbackPlatformAngle(platform: Platform, brief: ContentBrief): string {
  const keyPoint = brief.keyPoints[0] ?? brief.coreMessage

  if (platform === "linkedin") {
    return `Fokusér på ekspertindsigt og konkrete takeaways omkring: ${keyPoint}`
  }
  if (platform === "instagram") {
    return `Fortæl en visuel mini-historie med følelsesmæssigt hook om: ${keyPoint}`
  }
  if (platform === "tiktok") {
    return `Start med en skarp observation og byg tempo omkring: ${keyPoint}`
  }
  if (platform === "facebook") {
    return `Byg relationel fortælling med dialogvenlig afslutning om: ${keyPoint}`
  }

  return `Komprimer budskabet til én skarp pointe + debatvinkel om: ${keyPoint}`
}

export function buildFallbackSupervisorGuidance(brief: ContentBrief): SupervisorGuidance {
  return {
    promptVersion: SUPERVISOR_PROMPT_VERSION,
    globalDirection: `Bevar kernebudskabet "${brief.coreMessage}" men varier hook, vinkel og CTA tydeligt per platform.`,
    platformAngles: {
      linkedin: buildFallbackPlatformAngle("linkedin", brief),
      tiktok: buildFallbackPlatformAngle("tiktok", brief),
      instagram: buildFallbackPlatformAngle("instagram", brief),
      facebook: buildFallbackPlatformAngle("facebook", brief),
      twitter: buildFallbackPlatformAngle("twitter", brief),
    },
  }
}

export async function generateSupervisorGuidance(input: {
  brief: ContentBrief
  brandProfile: BrandProfile
}): Promise<SupervisorGuidance> {
  const openai = createOpenAIProvider()

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: supervisorSchema,
    temperature: 0.35,
    system: `
Du er Creative Supervisor i DelleRose.ai.
Din opgave er at skabe kreative vinkler, så platform-agenter producerer tydeligt forskellige posts.
Returnér kun JSON.
`.trim(),
    prompt: `
Prompt version: ${SUPERVISOR_PROMPT_VERSION}

Lav:
1) Én global kreativ retning for alle platforme.
2) Én platform-specifik angle for hver platform:
   - linkedin
   - tiktok
   - instagram
   - facebook
   - twitter

Regler:
- Opfind ikke fakta.
- Brug briefens kernebudskab aktivt.
- Sørg for at vinklerne er tydeligt forskellige.
- Hold hver angle kort, konkret og handlingsorienteret.

BrandProfile:
${JSON.stringify(input.brandProfile, null, 2)}

ContentBrief:
${JSON.stringify(input.brief, null, 2)}
`.trim(),
  })

  return {
    promptVersion: SUPERVISOR_PROMPT_VERSION,
    ...object,
  }
}
