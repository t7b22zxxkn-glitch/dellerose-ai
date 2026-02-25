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
import {
  createRequestId,
  logActionError,
  logActionInfo,
  logActionWarn,
} from "@/lib/observability/logger"
import { isOpenAIConfigured } from "@/lib/openai/config"
import {
  createActionFailure,
  createActionSuccess,
  type ActionResult,
} from "@/lib/server-actions/contracts"

type GeneratePlatformDraftsResult = ActionResult<{
  outputs: AgentOutput[]
}>

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
  ActionResult<{
    output: AgentOutput
  }>

const ACTION_GENERATE_PLATFORM_DRAFTS = "agent_engine.generate_platform_drafts"
const ACTION_REGENERATE_PLATFORM_DRAFT = "agent_engine.regenerate_platform_draft"
const PLATFORM_AGENT_MODEL = "gpt-4o"

function resolveOnboardingErrorCode(
  notice: string | null | undefined
): "unauthorized" | "missing_dependency" | "not_found" {
  const normalizedNotice = notice?.toLowerCase() ?? ""
  if (normalizedNotice.includes("logget ind")) {
    return "unauthorized"
  }
  if (normalizedNotice.includes("mangler konfiguration")) {
    return "missing_dependency"
  }
  return "not_found"
}

export async function generatePlatformDraftsAction(
  brief: ContentBrief
): Promise<GeneratePlatformDraftsResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()
  const resolveLatencyMs = () => Date.now() - startedAt

  const fail = (input: {
    code:
      | "invalid_input"
      | "missing_dependency"
      | "unauthorized"
      | "not_found"
      | "validation_failed"
      | "external_service_error"
      | "internal_error"
    message: string
    retryable: boolean
    userId?: string | null
    logLevel?: "warn" | "error"
    errorType?: string
    metadata?: Record<string, unknown>
  }) => {
    const failure = createActionFailure({
      code: input.code,
      message: input.message,
      retryable: input.retryable,
      requestId,
    })

    const logPayload = {
      requestId,
      actionName: ACTION_GENERATE_PLATFORM_DRAFTS,
      model: PLATFORM_AGENT_MODEL,
      userId: input.userId ?? null,
      latencyMs: resolveLatencyMs(),
      errorCode: failure.code,
      errorType: input.errorType ?? null,
      message: failure.message,
      metadata: {
        retryable: failure.retryable,
        ...(input.metadata ?? {}),
      },
    }

    if (input.logLevel === "warn") {
      logActionWarn(logPayload)
    } else {
      logActionError(logPayload)
    }

    return failure
  }

  try {
    if (!isOpenAIConfigured()) {
      return fail({
        code: "missing_dependency",
        message:
          "OPENAI_API_KEY mangler. Tilføj nøglen i miljøvariabler før platform-generering.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const parsedBrief = contentBriefSchema.safeParse(brief)

    if (!parsedBrief.success) {
      return fail({
        code: "invalid_input",
        message: "ContentBrief er ugyldig og kunne ikke behandles.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const onboarding = await getOnboardingBootstrap()
    const brandProfile = onboarding.profile

    if (!brandProfile) {
      return fail({
        code: resolveOnboardingErrorCode(onboarding.notice),
        message:
          onboarding.notice ??
          "Brand Profile mangler. Udfyld onboarding før platform-drafts kan genereres.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const generatorInput = {
      brief: parsedBrief.data,
      brandProfile,
    }

    const settledDrafts = await Promise.all(
      platformOrder.map(async (platform) => {
        try {
          return {
            platform,
            output: await platformGenerators[platform](generatorInput),
            usedFallback: false,
            fallbackErrorType: null as string | null,
          }
        } catch (error: unknown) {
          // Ensure one platform failure does not block all output.
          return {
            platform,
            output: buildFallbackAgentOutput(platform, parsedBrief.data),
            usedFallback: true,
            fallbackErrorType: error instanceof Error ? error.name : "UnknownError",
          }
        }
      })
    )

    const fallbackPlatforms = settledDrafts
      .filter((draft) => draft.usedFallback)
      .map((draft) => draft.platform)
    const parsedOutputs = platformOutputsSchema.safeParse(
      settledDrafts.map((draft) => draft.output)
    )

    if (!parsedOutputs.success) {
      return fail({
        code: "validation_failed",
        message:
          "Platform-outputs kunne ikke valideres efter orkestrering. Prøv igen.",
        retryable: false,
        userId: brandProfile.userId,
        metadata: {
          validationIssueCount: parsedOutputs.error.issues.length,
          fallbackCount: fallbackPlatforms.length,
        },
      })
    }

    if (fallbackPlatforms.length > 0) {
      logActionWarn({
        requestId,
        actionName: ACTION_GENERATE_PLATFORM_DRAFTS,
        userId: brandProfile.userId,
        model: PLATFORM_AGENT_MODEL,
        latencyMs: resolveLatencyMs(),
        errorCode: "external_service_error",
        message: "Platform fallback output was used for one or more platforms.",
        metadata: {
          fallbackPlatforms,
          fallbackCount: fallbackPlatforms.length,
        },
      })
    }

    logActionInfo({
      requestId,
      actionName: ACTION_GENERATE_PLATFORM_DRAFTS,
      userId: brandProfile.userId,
      model: PLATFORM_AGENT_MODEL,
      latencyMs: resolveLatencyMs(),
      message: "Platform drafts generated successfully.",
      metadata: {
        platformCount: parsedOutputs.data.length,
        fallbackCount: fallbackPlatforms.length,
      },
    })

    return createActionSuccess(requestId, { outputs: parsedOutputs.data })
  } catch (error: unknown) {
    return fail({
      code: "external_service_error",
      message:
        "Multi-Agent Engine fejlede under generering. Kontroller API-nøgler og prøv igen.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}

export async function regeneratePlatformDraftAction(
  platform: Platform,
  brief: ContentBrief
): Promise<RegeneratePlatformDraftResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()
  const resolveLatencyMs = () => Date.now() - startedAt

  const fail = (input: {
    code:
      | "invalid_input"
      | "missing_dependency"
      | "unauthorized"
      | "not_found"
      | "validation_failed"
      | "external_service_error"
      | "internal_error"
    message: string
    retryable: boolean
    userId?: string | null
    platform?: Platform
    logLevel?: "warn" | "error"
    errorType?: string
    metadata?: Record<string, unknown>
  }) => {
    const failure = createActionFailure({
      code: input.code,
      message: input.message,
      retryable: input.retryable,
      requestId,
    })

    const logPayload = {
      requestId,
      actionName: ACTION_REGENERATE_PLATFORM_DRAFT,
      model: PLATFORM_AGENT_MODEL,
      userId: input.userId ?? null,
      platform: input.platform ?? null,
      latencyMs: resolveLatencyMs(),
      errorCode: failure.code,
      errorType: input.errorType ?? null,
      message: failure.message,
      metadata: {
        retryable: failure.retryable,
        ...(input.metadata ?? {}),
      },
    }

    if (input.logLevel === "warn") {
      logActionWarn(logPayload)
    } else {
      logActionError(logPayload)
    }

    return failure
  }

  try {
    if (!isOpenAIConfigured()) {
      return fail({
        code: "missing_dependency",
        message:
          "OPENAI_API_KEY mangler. Tilføj nøglen i miljøvariabler før regenerering.",
        retryable: false,
        platform,
        logLevel: "warn",
      })
    }

    const parsedPlatform = platformSchema.safeParse(platform)
    const parsedBrief = contentBriefSchema.safeParse(brief)

    if (!parsedPlatform.success || !parsedBrief.success) {
      return fail({
        code: "invalid_input",
        message: "Platform eller ContentBrief er ugyldig.",
        retryable: false,
        platform,
        logLevel: "warn",
      })
    }

    const onboarding = await getOnboardingBootstrap()
    const brandProfile = onboarding.profile

    if (!brandProfile) {
      return fail({
        code: resolveOnboardingErrorCode(onboarding.notice),
        message:
          onboarding.notice ??
          "Brand Profile mangler. Udfyld onboarding før regenerering.",
        retryable: false,
        platform: parsedPlatform.data,
        logLevel: "warn",
      })
    }

    let fallbackErrorType: string | null = null
    let usedFallback = false
    const output = await (async (): Promise<AgentOutput> => {
      try {
        return await platformGenerators[parsedPlatform.data]({
          brief: parsedBrief.data,
          brandProfile,
        })
      } catch (error: unknown) {
        usedFallback = true
        fallbackErrorType = error instanceof Error ? error.name : "UnknownError"
        return buildFallbackAgentOutput(parsedPlatform.data, parsedBrief.data)
      }
    })()

    const parsedOutput = agentOutputSchema.safeParse(output)
    if (!parsedOutput.success) {
      return fail({
        code: "validation_failed",
        message: "Regenereret output kunne ikke valideres.",
        retryable: false,
        userId: brandProfile.userId,
        platform: parsedPlatform.data,
        metadata: {
          validationIssueCount: parsedOutput.error.issues.length,
          fallbackApplied: usedFallback,
        },
      })
    }

    if (usedFallback) {
      logActionWarn({
        requestId,
        actionName: ACTION_REGENERATE_PLATFORM_DRAFT,
        userId: brandProfile.userId,
        platform: parsedPlatform.data,
        model: PLATFORM_AGENT_MODEL,
        latencyMs: resolveLatencyMs(),
        errorCode: "external_service_error",
        errorType: fallbackErrorType,
        message: "Primary regenerate failed, fallback output was used.",
      })
    }

    logActionInfo({
      requestId,
      actionName: ACTION_REGENERATE_PLATFORM_DRAFT,
      userId: brandProfile.userId,
      platform: parsedPlatform.data,
      model: PLATFORM_AGENT_MODEL,
      latencyMs: resolveLatencyMs(),
      message: "Platform draft regenerated successfully.",
      metadata: {
        fallbackApplied: usedFallback,
      },
    })

    return createActionSuccess(requestId, { output: parsedOutput.data })
  } catch (error: unknown) {
    return fail({
      code: "external_service_error",
      message: "Regenerering fejlede. Prøv igen.",
      retryable: true,
      platform,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}
