"use server"

import { z } from "zod"

import { getOnboardingBootstrap } from "@/features/onboarding/service"
import { generateFacebookAgentOutput } from "@/lib/agents/facebook"
import { generateInstagramAgentOutput } from "@/lib/agents/instagram"
import { generateLinkedInAgentOutput } from "@/lib/agents/linkedin"
import { generateTikTokAgentOutput } from "@/lib/agents/tiktok"
import { generateTwitterAgentOutput } from "@/lib/agents/twitter"
import { agentOutputSchema, contentBriefSchema } from "@/lib/schemas/domain"
import type { AgentOutput, ContentBrief } from "@/lib/types/domain"

type GeneratePlatformDraftsResult =
  | {
      success: true
      outputs: AgentOutput[]
    }
  | {
      success: false
      message: string
    }

const platformOutputsSchema = z.array(agentOutputSchema).length(5)

export async function generatePlatformDraftsAction(
  brief: ContentBrief
): Promise<GeneratePlatformDraftsResult> {
  try {
    const parsedBrief = contentBriefSchema.safeParse(brief)

    if (!parsedBrief.success) {
      return {
        success: false,
        message: "ContentBrief er ugyldig og kunne ikke behandles.",
      }
    }

    const onboarding = await getOnboardingBootstrap()

    if (!onboarding.profile) {
      return {
        success: false,
        message:
          onboarding.notice ??
          "Brand Profile mangler. Udfyld onboarding før platform-drafts kan genereres.",
      }
    }

    const input = {
      brief: parsedBrief.data,
      brandProfile: onboarding.profile,
    }

    const [linkedin, tiktok, instagram, facebook, twitter] = await Promise.all([
      generateLinkedInAgentOutput(input),
      generateTikTokAgentOutput(input),
      generateInstagramAgentOutput(input),
      generateFacebookAgentOutput(input),
      generateTwitterAgentOutput(input),
    ])

    const parsedOutputs = platformOutputsSchema.safeParse([
      linkedin,
      tiktok,
      instagram,
      facebook,
      twitter,
    ])

    if (!parsedOutputs.success) {
      return {
        success: false,
        message:
          "Platform-outputs kunne ikke valideres efter orkestrering. Prøv igen.",
      }
    }

    return {
      success: true,
      outputs: parsedOutputs.data,
    }
  } catch {
    return {
      success: false,
      message:
        "Multi-Agent Engine fejlede under generering. Kontroller API-nøgler og prøv igen.",
    }
  }
}
