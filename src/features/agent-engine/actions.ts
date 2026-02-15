"use server"

import { z } from "zod"

import { getOnboardingBootstrap } from "@/features/onboarding/service"
import { generateFacebookAgentOutput } from "@/lib/agents/facebook"
import { generateInstagramAgentOutput } from "@/lib/agents/instagram"
import { generateLinkedInAgentOutput } from "@/lib/agents/linkedin"
import { generateTikTokAgentOutput } from "@/lib/agents/tiktok"
import { generateTwitterAgentOutput } from "@/lib/agents/twitter"
import {
  agentOutputSchema,
  contentBriefSchema,
  platformSchema,
} from "@/lib/schemas/domain"
import type {
  AgentOutput,
  BrandProfile,
  ContentBrief,
  Platform,
} from "@/lib/types/domain"

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

type AgentGeneratorInput = {
  brief: ContentBrief
  brandProfile: BrandProfile
}

const platformGenerators: Record<
  Platform,
  (input: AgentGeneratorInput) => Promise<AgentOutput>
> = {
  linkedin: generateLinkedInAgentOutput,
  tiktok: generateTikTokAgentOutput,
  instagram: generateInstagramAgentOutput,
  facebook: generateFacebookAgentOutput,
  twitter: generateTwitterAgentOutput,
}

type RegeneratePlatformDraftResult =
  | {
      success: true
      output: AgentOutput
    }
  | {
      success: false
      message: string
    }

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

    const [linkedin, tiktok, instagram, facebook, twitter] = await Promise.all(
      [
        platformGenerators.linkedin(input),
        platformGenerators.tiktok(input),
        platformGenerators.instagram(input),
        platformGenerators.facebook(input),
        platformGenerators.twitter(input),
      ]
    )

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

export async function regeneratePlatformDraftAction(
  platform: Platform,
  brief: ContentBrief
): Promise<RegeneratePlatformDraftResult> {
  try {
    const parsedPlatform = platformSchema.safeParse(platform)
    const parsedBrief = contentBriefSchema.safeParse(brief)

    if (!parsedPlatform.success || !parsedBrief.success) {
      return {
        success: false,
        message: "Platform eller ContentBrief er ugyldig.",
      }
    }

    const onboarding = await getOnboardingBootstrap()

    if (!onboarding.profile) {
      return {
        success: false,
        message:
          onboarding.notice ??
          "Brand Profile mangler. Udfyld onboarding før regenerering.",
      }
    }

    const output = await platformGenerators[parsedPlatform.data]({
      brief: parsedBrief.data,
      brandProfile: onboarding.profile,
    })

    const parsedOutput = agentOutputSchema.safeParse(output)
    if (!parsedOutput.success) {
      return {
        success: false,
        message: "Regenereret output kunne ikke valideres.",
      }
    }

    return {
      success: true,
      output: parsedOutput.data,
    }
  } catch {
    return {
      success: false,
      message: "Regenerering fejlede. Prøv igen.",
    }
  }
}
