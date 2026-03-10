"use server"

import {
  buildFallbackBrandBlueprint,
  generateBrandBlueprintFromInterview,
} from "@/lib/agents/brand-architect"
import {
  createRequestId,
  logActionError,
  logActionInfo,
  logActionWarn,
} from "@/lib/observability/logger"
import {
  createActionFailure,
  createActionSuccess,
  type ActionResult,
} from "@/lib/server-actions/contracts"
import { isOpenAIConfigured } from "@/lib/openai/config"
import type { BrandBlueprint, PersistedBrandBlueprint } from "@/lib/types/domain"

import {
  approveBrandBlueprintInputSchema,
  brandBlueprintAnalysisInputSchema,
  saveManualBrandBlueprintInputSchema,
} from "./schema"
import {
  approveBrandBlueprintForCurrentUser,
  upsertBrandBlueprintDraftForCurrentUser,
} from "./service"

const ACTION_ANALYZE_BRAND_BLUEPRINT = "brand_blueprint.analyze"
const ACTION_APPROVE_BRAND_BLUEPRINT = "brand_blueprint.approve"
const ACTION_SAVE_MANUAL_BRAND_BLUEPRINT = "brand_blueprint.save_manual"
const BRAND_ARCHITECT_MODEL = "gpt-4o"

type AnalyzeBrandBlueprintResult = ActionResult<{
  blueprint: PersistedBrandBlueprint
}>

type ApproveBrandBlueprintResult = ActionResult<{
  blueprint: PersistedBrandBlueprint
}>

type SaveManualBrandBlueprintResult = ActionResult<{
  blueprint: PersistedBrandBlueprint
}>

function joinInterviewAnswers(answers: string[]): string {
  return answers
    .map((answer, index) => `Svar ${index + 1}: ${answer.trim()}`)
    .join("\n\n")
}

export async function analyzeBrandBlueprintInterviewAction(
  rawInput: unknown
): Promise<AnalyzeBrandBlueprintResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()
  const resolveLatencyMs = () => Date.now() - startedAt

  const fail = (input: {
    code:
      | "invalid_input"
      | "missing_dependency"
      | "database_error"
      | "validation_failed"
      | "external_service_error"
      | "internal_error"
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
      actionName: ACTION_ANALYZE_BRAND_BLUEPRINT,
      model: BRAND_ARCHITECT_MODEL,
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
    const parsedInput = brandBlueprintAnalysisInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return fail({
        code: "invalid_input",
        message: "Interview-input til Brand Blueprint er ugyldigt.",
        retryable: false,
        logLevel: "warn",
        metadata: {
          issueCount: parsedInput.error.issues.length,
        },
      })
    }

    const input = parsedInput.data
    const interviewTranscript =
      input.interviewTranscript.trim().length > 0
        ? input.interviewTranscript.trim()
        : joinInterviewAnswers(input.answers)

    const generated = await (async (): Promise<{
      promptVersion: string
      blueprint: BrandBlueprint
      usedFallback: boolean
    }> => {
      if (!isOpenAIConfigured()) {
        const fallback = buildFallbackBrandBlueprint({
          interviewAnswers: input.answers,
          interviewTranscript,
        })
        return {
          ...fallback,
          usedFallback: true,
        }
      }

      try {
        const aiOutput = await generateBrandBlueprintFromInterview({
          interviewAnswers: input.answers,
          interviewTranscript,
        })

        return {
          ...aiOutput,
          usedFallback: false,
        }
      } catch {
        const fallback = buildFallbackBrandBlueprint({
          interviewAnswers: input.answers,
          interviewTranscript,
        })
        return {
          ...fallback,
          usedFallback: true,
        }
      }
    })()

    const saveResult = await upsertBrandBlueprintDraftForCurrentUser({
      path: input.path,
      blueprint: generated.blueprint,
      interviewAnswers: input.answers,
      interviewTranscript,
    })

    if (!saveResult.success) {
      return fail({
        code: "database_error",
        message: saveResult.message,
        retryable: true,
      })
    }

    logActionInfo({
      requestId,
      actionName: ACTION_ANALYZE_BRAND_BLUEPRINT,
      model: BRAND_ARCHITECT_MODEL,
      latencyMs: resolveLatencyMs(),
      message: "Brand Blueprint draft generated and persisted.",
      userId: saveResult.blueprint.userId,
      metadata: {
        path: input.path,
        promptVersion: generated.promptVersion,
        usedFallback: generated.usedFallback,
      },
    })

    return createActionSuccess(requestId, { blueprint: saveResult.blueprint })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under analyse af Brand Blueprint.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}

export async function approveBrandBlueprintAction(
  rawInput: unknown
): Promise<ApproveBrandBlueprintResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()
  const resolveLatencyMs = () => Date.now() - startedAt

  const fail = (input: {
    code: "invalid_input" | "database_error" | "internal_error"
    message: string
    retryable: boolean
    errorType?: string
  }) =>
    createActionFailure({
      code: input.code,
      message: input.message,
      retryable: input.retryable,
      requestId,
    })

  try {
    const parsedInput = approveBrandBlueprintInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return fail({
        code: "invalid_input",
        message: "Blueprint ID er ugyldigt.",
        retryable: false,
      })
    }

    const result = await approveBrandBlueprintForCurrentUser(parsedInput.data.blueprintId)
    if (!result.success) {
      return fail({
        code: "database_error",
        message: result.message,
        retryable: true,
      })
    }

    logActionInfo({
      requestId,
      actionName: ACTION_APPROVE_BRAND_BLUEPRINT,
      userId: result.blueprint.userId,
      latencyMs: resolveLatencyMs(),
      message: "Brand Blueprint approved.",
      metadata: {
        blueprintId: result.blueprint.id,
        version: result.blueprint.version,
      },
    })

    return createActionSuccess(requestId, { blueprint: result.blueprint })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under godkendelse af Brand Blueprint.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}

export async function saveManualBrandBlueprintAction(
  rawInput: unknown
): Promise<SaveManualBrandBlueprintResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()
  const resolveLatencyMs = () => Date.now() - startedAt

  const fail = (input: {
    code: "invalid_input" | "database_error" | "internal_error"
    message: string
    retryable: boolean
    errorType?: string
  }) =>
    createActionFailure({
      code: input.code,
      message: input.message,
      retryable: input.retryable,
      requestId,
    })

  try {
    const parsedInput = saveManualBrandBlueprintInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return fail({
        code: "invalid_input",
        message: "Manuel blueprint data kunne ikke valideres.",
        retryable: false,
      })
    }

    const result = await upsertBrandBlueprintDraftForCurrentUser({
      path: parsedInput.data.path,
      blueprint: parsedInput.data.blueprint,
      interviewAnswers: parsedInput.data.interviewAnswers,
      interviewTranscript: parsedInput.data.interviewTranscript,
    })

    if (!result.success) {
      return fail({
        code: "database_error",
        message: result.message,
        retryable: true,
      })
    }

    logActionInfo({
      requestId,
      actionName: ACTION_SAVE_MANUAL_BRAND_BLUEPRINT,
      userId: result.blueprint.userId,
      latencyMs: resolveLatencyMs(),
      message: "Brand Blueprint manually updated and saved.",
      metadata: {
        blueprintId: result.blueprint.id,
        version: result.blueprint.version,
      },
    })

    return createActionSuccess(requestId, { blueprint: result.blueprint })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under manuel gemning af Brand Blueprint.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}
