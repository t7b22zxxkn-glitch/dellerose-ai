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

const platformOutputLimits: Record<
  Platform,
  {
    maxHookChars: number
    maxBodyChars: number
    maxCtaChars: number
    maxHashtags: number
    totalMaxChars?: number
  }
> = {
  linkedin: {
    maxHookChars: 180,
    maxBodyChars: 2200,
    maxCtaChars: 180,
    maxHashtags: 5,
  },
  tiktok: {
    maxHookChars: 100,
    maxBodyChars: 500,
    maxCtaChars: 120,
    maxHashtags: 8,
  },
  instagram: {
    maxHookChars: 150,
    maxBodyChars: 2000,
    maxCtaChars: 140,
    maxHashtags: 12,
  },
  facebook: {
    maxHookChars: 180,
    maxBodyChars: 2400,
    maxCtaChars: 180,
    maxHashtags: 6,
  },
  twitter: {
    maxHookChars: 80,
    maxBodyChars: 160,
    maxCtaChars: 60,
    maxHashtags: 4,
    totalMaxChars: 280,
  },
}

const platformOrder: Platform[] = [
  "linkedin",
  "tiktok",
  "instagram",
  "facebook",
  "twitter",
]

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }

  if (maxChars <= 1) {
    return value.slice(0, maxChars)
  }

  return `${value.slice(0, maxChars - 1).trimEnd()}…`
}

function toTagSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/gi, "")
    .trim()
}

function buildFallbackHashtags(
  platform: Platform,
  brief: ContentBrief
): string[] {
  const limits = platformOutputLimits[platform]

  const candidates = [
    brief.intent,
    brief.emotionalTone,
    brief.targetAudience,
    "dellerose",
    "socialmedia",
  ]

  const hashtags = candidates
    .map(toTagSlug)
    .filter((tag) => tag.length > 1)
    .map((tag) => `#${tag}`)

  return Array.from(new Set(hashtags)).slice(0, limits.maxHashtags)
}

function fitWithinTotalLimit(
  hook: string,
  body: string,
  cta: string,
  totalMaxChars: number
): { hook: string; body: string; cta: string } {
  const withLineBreaks = () => `${hook}\n${body}\n${cta}`

  if (withLineBreaks().length <= totalMaxChars) {
    return { hook, body, cta }
  }

  const allowedBodyLength = Math.max(
    0,
    totalMaxChars - (hook.length + cta.length + 2)
  )
  body = truncateText(body, allowedBodyLength)

  if (withLineBreaks().length <= totalMaxChars) {
    return { hook, body, cta }
  }

  const allowedCtaLength = Math.max(0, totalMaxChars - (hook.length + body.length + 2))
  cta = truncateText(cta, allowedCtaLength)

  if (withLineBreaks().length <= totalMaxChars) {
    return { hook, body, cta }
  }

  const allowedHookLength = Math.max(0, totalMaxChars - (body.length + cta.length + 2))
  hook = truncateText(hook, allowedHookLength)

  return { hook, body, cta }
}

function buildFallbackAgentOutput(
  platform: Platform,
  brief: ContentBrief
): AgentOutput {
  const limits = platformOutputLimits[platform]
  const firstPoint = brief.keyPoints[0] ?? brief.coreMessage

  let hook = truncateText(brief.coreMessage, limits.maxHookChars)
  let body = truncateText(
    `${firstPoint}\n\nMålgruppe: ${brief.targetAudience}`,
    limits.maxBodyChars
  )
  let cta = truncateText(
    "Del gerne din vinkel i kommentarfeltet.",
    limits.maxCtaChars
  )

  if (limits.totalMaxChars) {
    const fitted = fitWithinTotalLimit(hook, body, cta, limits.totalMaxChars)
    hook = fitted.hook
    body = fitted.body
    cta = fitted.cta
  }

  return {
    platform,
    hook,
    body,
    cta,
    hashtags: buildFallbackHashtags(platform, brief),
    visualSuggestion: truncateText(
      `Visuelt motiv der understøtter: ${brief.coreMessage}`,
      240
    ),
    status: "draft",
  }
}

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

    const settledDrafts = await Promise.all(
      platformOrder.map(async (platform) => {
        try {
          return await platformGenerators[platform](input)
        } catch {
          // Ensure one platform failure does not block all output.
          return buildFallbackAgentOutput(platform, parsedBrief.data)
        }
      })
    )

    const parsedOutputs = platformOutputsSchema.safeParse(settledDrafts)

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

    const output = await (async () => {
      try {
        return await platformGenerators[parsedPlatform.data]({
          brief: parsedBrief.data,
          brandProfile: onboarding.profile,
        })
      } catch {
        return buildFallbackAgentOutput(parsedPlatform.data, parsedBrief.data)
      }
    })()

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
