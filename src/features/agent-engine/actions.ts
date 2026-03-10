"use server"

import { z } from "zod"

import { getOnboardingBootstrap } from "@/features/onboarding/service"
import { generateFacebookAgentOutput } from "@/lib/agents/facebook"
import { generateInstagramAgentOutput } from "@/lib/agents/instagram"
import { generateLinkedInAgentOutput } from "@/lib/agents/linkedin"
import {
  buildFallbackSupervisorGuidance,
  generateSupervisorGuidance,
  type SupervisorGuidance,
} from "@/lib/agents/supervisor"
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

const DIVERSITY_SIMILARITY_THRESHOLD = 0.68

function normalizeTextForSimilarity(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]/g, " ")
    .replace(/[^a-z0-9æøå\s]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

function calculateJaccardSimilarity(leftTokens: string[], rightTokens: string[]): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0
  }

  const leftSet = new Set(leftTokens)
  const rightSet = new Set(rightTokens)

  let intersection = 0
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1
    }
  }

  const union = leftSet.size + rightSet.size - intersection
  if (union === 0) {
    return 0
  }

  return intersection / union
}

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

function buildPlatformSpecificCta(platform: Platform): string {
  if (platform === "linkedin") {
    return "Hvilken erfaring har du selv med dette i praksis?"
  }
  if (platform === "instagram") {
    return "Gem opslaget og del din vinkel i kommentarfeltet."
  }
  if (platform === "tiktok") {
    return "Skriv “del 2” i kommentaren, hvis du vil have næste take."
  }
  if (platform === "facebook") {
    return "Hvad tænker du om den her vinkel? Del gerne din holdning."
  }
  return "Enig eller uenig? Svar med din vinkel."
}

function diversifyOutputIfNeeded(
  output: AgentOutput,
  brief: ContentBrief,
  guidance: SupervisorGuidance
): AgentOutput {
  const limits = platformOutputLimits[output.platform]
  const platformIndex = platformOrder.indexOf(output.platform)
  const keyPoint = brief.keyPoints[platformIndex] ?? brief.keyPoints[0] ?? brief.coreMessage
  const angle = guidance.platformAngles[output.platform]

  let hook = truncateText(`${angle}`, limits.maxHookChars)
  let body = truncateText(
    `${keyPoint}\n\nPlatformfokus: ${angle}\n\nMålgruppe: ${brief.targetAudience}`,
    limits.maxBodyChars
  )
  let cta = truncateText(buildPlatformSpecificCta(output.platform), limits.maxCtaChars)

  if (limits.totalMaxChars) {
    const fitted = fitWithinTotalLimit(hook, body, cta, limits.totalMaxChars)
    hook = fitted.hook
    body = fitted.body
    cta = fitted.cta
  }

  return {
    ...output,
    hook,
    body,
    cta,
  }
}

function enforcePlatformDiversity(
  outputs: AgentOutput[],
  brief: ContentBrief,
  guidance: SupervisorGuidance
): {
  outputs: AgentOutput[]
  adjustedPlatforms: Platform[]
  maxSimilarityScore: number
} {
  const normalizedByPlatform = new Map<Platform, string[]>()

  for (const output of outputs) {
    normalizedByPlatform.set(
      output.platform,
      normalizeTextForSimilarity(`${output.hook}\n${output.body}\n${output.cta}`)
    )
  }

  const platformsToAdjust = new Set<Platform>()
  let maxSimilarityScore = 0

  for (let leftIndex = 0; leftIndex < outputs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < outputs.length; rightIndex += 1) {
      const left = outputs[leftIndex]
      const right = outputs[rightIndex]
      const leftTokens = normalizedByPlatform.get(left.platform) ?? []
      const rightTokens = normalizedByPlatform.get(right.platform) ?? []
      const similarityScore = calculateJaccardSimilarity(leftTokens, rightTokens)
      maxSimilarityScore = Math.max(maxSimilarityScore, similarityScore)

      if (similarityScore >= DIVERSITY_SIMILARITY_THRESHOLD) {
        platformsToAdjust.add(left.platform)
        platformsToAdjust.add(right.platform)
      }
    }
  }

  if (platformsToAdjust.size === 0) {
    return {
      outputs,
      adjustedPlatforms: [],
      maxSimilarityScore,
    }
  }

  const diversified = outputs.map((output) => {
    if (!platformsToAdjust.has(output.platform)) {
      return output
    }
    return diversifyOutputIfNeeded(output, brief, guidance)
  })

  return {
    outputs: diversified,
    adjustedPlatforms: platformOrder.filter((platform) => platformsToAdjust.has(platform)),
    maxSimilarityScore,
  }
}

type AgentGeneratorInput = {
  brief: ContentBrief
  brandProfile: BrandProfile
  supervisorGuidance?: SupervisorGuidance
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
const ACTION_SUPERVISOR_GUIDANCE = "agent_engine.supervisor_guidance"
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

async function resolveSupervisorGuidance(input: {
  brief: ContentBrief
  brandProfile: BrandProfile
  requestId: string
}): Promise<{
  guidance: SupervisorGuidance
  usedFallback: boolean
}> {
  try {
    const guidance = await generateSupervisorGuidance({
      brief: input.brief,
      brandProfile: input.brandProfile,
    })

    return {
      guidance,
      usedFallback: false,
    }
  } catch (error: unknown) {
    logActionWarn({
      requestId: input.requestId,
      actionName: ACTION_SUPERVISOR_GUIDANCE,
      userId: input.brandProfile.userId,
      model: PLATFORM_AGENT_MODEL,
      errorCode: "external_service_error",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: "Supervisor guidance fallback was used.",
    })

    return {
      guidance: buildFallbackSupervisorGuidance(input.brief),
      usedFallback: true,
    }
  }
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

    const supervisorResult = await resolveSupervisorGuidance({
      brief: parsedBrief.data,
      brandProfile,
      requestId,
    })

    const generatorInput = {
      brief: parsedBrief.data,
      brandProfile,
      supervisorGuidance: supervisorResult.guidance,
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

    const diversityResult = enforcePlatformDiversity(
      parsedOutputs.data,
      parsedBrief.data,
      supervisorResult.guidance
    )
    const diversityValidated = platformOutputsSchema.safeParse(diversityResult.outputs)
    if (!diversityValidated.success) {
      return fail({
        code: "validation_failed",
        message: "Diversity-guardrail output kunne ikke valideres.",
        retryable: false,
        userId: brandProfile.userId,
        metadata: {
          validationIssueCount: diversityValidated.error.issues.length,
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

    if (diversityResult.adjustedPlatforms.length > 0) {
      logActionWarn({
        requestId,
        actionName: ACTION_GENERATE_PLATFORM_DRAFTS,
        userId: brandProfile.userId,
        model: PLATFORM_AGENT_MODEL,
        message: "Diversity guardrail adjusted similar platform drafts.",
        metadata: {
          adjustedPlatforms: diversityResult.adjustedPlatforms,
          maxSimilarityScore: Number(diversityResult.maxSimilarityScore.toFixed(3)),
          threshold: DIVERSITY_SIMILARITY_THRESHOLD,
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
        platformCount: diversityValidated.data.length,
        fallbackCount: fallbackPlatforms.length,
        supervisorFallback: supervisorResult.usedFallback,
        supervisorPromptVersion: supervisorResult.guidance.promptVersion,
        diversityAdjustedCount: diversityResult.adjustedPlatforms.length,
        maxSimilarityScore: Number(diversityResult.maxSimilarityScore.toFixed(3)),
      },
    })

    return createActionSuccess(requestId, { outputs: diversityValidated.data })
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

    const supervisorResult = await resolveSupervisorGuidance({
      brief: parsedBrief.data,
      brandProfile,
      requestId,
    })

    let fallbackErrorType: string | null = null
    let usedFallback = false
    const output = await (async (): Promise<AgentOutput> => {
      try {
        return await platformGenerators[parsedPlatform.data]({
          brief: parsedBrief.data,
          brandProfile,
          supervisorGuidance: supervisorResult.guidance,
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
        supervisorFallback: supervisorResult.usedFallback,
        supervisorPromptVersion: supervisorResult.guidance.promptVersion,
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
