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
  draftQualityReportSchema,
  platformSchema,
} from "@/lib/schemas/domain"
import type {
  AgentOutput,
  BrandBlueprint,
  BrandProfile,
  ContentBrief,
  DraftQualityFlag,
  DraftQualityReport,
  DraftSimilarityPair,
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
  qualityReport: DraftQualityReport
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
  similarityPairs: DraftSimilarityPair[]
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
  const similarityPairs: DraftSimilarityPair[] = []
  let maxSimilarityScore = 0

  for (let leftIndex = 0; leftIndex < outputs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < outputs.length; rightIndex += 1) {
      const left = outputs[leftIndex]
      const right = outputs[rightIndex]
      const leftTokens = normalizedByPlatform.get(left.platform) ?? []
      const rightTokens = normalizedByPlatform.get(right.platform) ?? []
      const similarityScore = calculateJaccardSimilarity(leftTokens, rightTokens)
      maxSimilarityScore = Math.max(maxSimilarityScore, similarityScore)
      similarityPairs.push({
        leftPlatform: left.platform,
        rightPlatform: right.platform,
        similarityScore: Number(similarityScore.toFixed(3)),
        exceedsThreshold: similarityScore >= DIVERSITY_SIMILARITY_THRESHOLD,
      })

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
      similarityPairs,
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
    similarityPairs,
    maxSimilarityScore,
  }
}

function calculateAngleAlignmentScore(angle: string, output: AgentOutput): number {
  const angleTokens = normalizeTextForSimilarity(angle)
  const outputTokens = normalizeTextForSimilarity(`${output.hook}\n${output.body}\n${output.cta}`)

  if (angleTokens.length === 0 || outputTokens.length === 0) {
    return 0
  }

  const outputSet = new Set(outputTokens)
  let alignedCount = 0
  for (const token of new Set(angleTokens)) {
    if (outputSet.has(token)) {
      alignedCount += 1
    }
  }

  return alignedCount / new Set(angleTokens).size
}

function buildDraftQualityReport(input: {
  outputs: AgentOutput[]
  guidance: SupervisorGuidance
  diversityAdjustedPlatforms: Platform[]
  similarityPairs: DraftSimilarityPair[]
  maxSimilarityScore: number
}): DraftQualityReport {
  const flags: DraftQualityFlag[] = []

  for (const pair of input.similarityPairs) {
    if (!pair.exceedsThreshold) {
      continue
    }
    flags.push({
      platform: pair.leftPlatform,
      code: "high_cross_platform_similarity",
      severity: "warning",
      message: `${pair.leftPlatform} og ${pair.rightPlatform} har høj tekst-overlap (${Math.round(pair.similarityScore * 100)}%).`,
    })
    flags.push({
      platform: pair.rightPlatform,
      code: "high_cross_platform_similarity",
      severity: "warning",
      message: `${pair.rightPlatform} og ${pair.leftPlatform} har høj tekst-overlap (${Math.round(pair.similarityScore * 100)}%).`,
    })
  }

  for (const output of input.outputs) {
    const angle = input.guidance.platformAngles[output.platform]
    const alignmentScore = calculateAngleAlignmentScore(angle, output)
    if (alignmentScore < 0.15) {
      flags.push({
        platform: output.platform,
        code: "low_angle_alignment",
        severity: "warning",
        message: `${output.platform} følger kun svagt supervisor-vinklen (${Math.round(alignmentScore * 100)}% token-match).`,
      })
    }
  }

  const report = draftQualityReportSchema.parse({
    supervisorPromptVersion: input.guidance.promptVersion,
    globalDirection: input.guidance.globalDirection,
    platformAngles: input.guidance.platformAngles,
    similarityThreshold: DIVERSITY_SIMILARITY_THRESHOLD,
    maxSimilarityScore: Number(input.maxSimilarityScore.toFixed(3)),
    similarityPairs: input.similarityPairs,
    diversityAdjustedPlatforms: input.diversityAdjustedPlatforms,
    flags,
  })

  return report
}

type AgentGeneratorInput = {
  brief: ContentBrief
  brandProfile: BrandProfile
  brandBlueprint?: BrandBlueprint
  supervisorGuidance?: SupervisorGuidance
  regenerationInstruction?: string
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

type RescoreDraftQualityResult = ActionResult<{
  qualityReport: DraftQualityReport
}>

const regenerateInstructionSchema = z.string().trim().min(3).max(280)
const rescoreDraftQualityInputSchema = z.object({
  brief: contentBriefSchema,
  outputs: z.array(agentOutputSchema).length(5),
  previousQualityReport: draftQualityReportSchema.nullable().optional(),
})

const ACTION_GENERATE_PLATFORM_DRAFTS = "agent_engine.generate_platform_drafts"
const ACTION_REGENERATE_PLATFORM_DRAFT = "agent_engine.regenerate_platform_draft"
const ACTION_SUPERVISOR_GUIDANCE = "agent_engine.supervisor_guidance"
const ACTION_RESCORE_DRAFT_QUALITY = "agent_engine.rescore_draft_quality"
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
    const brandBlueprint = onboarding.blueprint?.blueprint

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
      brandBlueprint,
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

    const qualityReport = buildDraftQualityReport({
      outputs: diversityValidated.data,
      guidance: supervisorResult.guidance,
      diversityAdjustedPlatforms: diversityResult.adjustedPlatforms,
      similarityPairs: diversityResult.similarityPairs,
      maxSimilarityScore: diversityResult.maxSimilarityScore,
    })

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
        qualityFlagCount: qualityReport.flags.length,
      },
    })

    return createActionSuccess(requestId, { outputs: diversityValidated.data, qualityReport })
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
  brief: ContentBrief,
  instruction?: string
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
    const parsedInstruction =
      typeof instruction === "string" && instruction.trim().length > 0
        ? regenerateInstructionSchema.safeParse(instruction)
        : null

    if (
      !parsedPlatform.success ||
      !parsedBrief.success ||
      (parsedInstruction !== null && !parsedInstruction.success)
    ) {
      return fail({
        code: "invalid_input",
        message: "Platform, ContentBrief eller instruction er ugyldig.",
        retryable: false,
        platform,
        logLevel: "warn",
      })
    }

    const onboarding = await getOnboardingBootstrap()
    const brandProfile = onboarding.profile
    const brandBlueprint = onboarding.blueprint?.blueprint

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
          brandBlueprint,
          supervisorGuidance: supervisorResult.guidance,
          regenerationInstruction:
            parsedInstruction && parsedInstruction.success ? parsedInstruction.data : undefined,
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
        hasInstruction: Boolean(parsedInstruction && parsedInstruction.success),
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

export async function rescoreDraftQualityAction(
  rawInput: unknown
): Promise<RescoreDraftQualityResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()
  const resolveLatencyMs = () => Date.now() - startedAt

  const fail = (input: {
    code: "invalid_input" | "validation_failed" | "internal_error"
    message: string
    retryable: boolean
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

    const payload = {
      requestId,
      actionName: ACTION_RESCORE_DRAFT_QUALITY,
      model: PLATFORM_AGENT_MODEL,
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
      logActionWarn(payload)
    } else {
      logActionError(payload)
    }

    return failure
  }

  try {
    const parsedInput = rescoreDraftQualityInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return fail({
        code: "invalid_input",
        message: "Draft quality input kunne ikke valideres.",
        retryable: false,
        logLevel: "warn",
        metadata: {
          issueCount: parsedInput.error.issues.length,
        },
      })
    }

    const input = parsedInput.data
    const guidance: SupervisorGuidance = input.previousQualityReport
      ? {
          promptVersion: input.previousQualityReport.supervisorPromptVersion,
          globalDirection: input.previousQualityReport.globalDirection,
          platformAngles: input.previousQualityReport.platformAngles,
        }
      : buildFallbackSupervisorGuidance(input.brief)

    const diversityResult = enforcePlatformDiversity(input.outputs, input.brief, guidance)
    const parsedOutputs = platformOutputsSchema.safeParse(diversityResult.outputs)
    if (!parsedOutputs.success) {
      return fail({
        code: "validation_failed",
        message: "Rescore kunne ikke validere draft outputs.",
        retryable: false,
        metadata: {
          validationIssueCount: parsedOutputs.error.issues.length,
        },
      })
    }

    const qualityReport = buildDraftQualityReport({
      outputs: parsedOutputs.data,
      guidance,
      diversityAdjustedPlatforms: diversityResult.adjustedPlatforms,
      similarityPairs: diversityResult.similarityPairs,
      maxSimilarityScore: diversityResult.maxSimilarityScore,
    })

    logActionInfo({
      requestId,
      actionName: ACTION_RESCORE_DRAFT_QUALITY,
      model: PLATFORM_AGENT_MODEL,
      latencyMs: resolveLatencyMs(),
      message: "Draft quality report was recalculated.",
      metadata: {
        adjustedPlatforms: diversityResult.adjustedPlatforms,
        flagCount: qualityReport.flags.length,
      },
    })

    return createActionSuccess(requestId, { qualityReport })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under recalculation af draft quality.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}
