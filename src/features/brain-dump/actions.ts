"use server"

import type { ContentBrief } from "@/lib/types/domain"

import { analyzeRequestSchema } from "@/features/brain-dump/schema"
import { generateContentBriefFromTranscript } from "@/lib/agents/master"
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

type AnalyzeTranscriptActionResult = ActionResult<{
  brief: ContentBrief
}>

const ACTION_NAME = "brain_dump.analyze_transcript"
const MASTER_MODEL = "gpt-4o"

export async function analyzeTranscriptAction(
  transcript: string
): Promise<AnalyzeTranscriptActionResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()

  const resolveLatencyMs = () => Date.now() - startedAt

  const fail = (input: {
    code:
      | "invalid_input"
      | "missing_dependency"
      | "external_service_error"
      | "internal_error"
    message: string
    retryable: boolean
    logLevel?: "warn" | "error"
    errorType?: string
  }) => {
    const failure = createActionFailure({
      code: input.code,
      message: input.message,
      retryable: input.retryable,
      requestId,
    })

    const logPayload = {
      requestId,
      actionName: ACTION_NAME,
      model: MASTER_MODEL,
      latencyMs: resolveLatencyMs(),
      errorCode: failure.code,
      errorType: input.errorType ?? null,
      message: failure.message,
      metadata: {
        retryable: failure.retryable,
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
          "OPENAI_API_KEY mangler. Tilføj nøglen i miljøvariabler før analyse.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const input = analyzeRequestSchema.safeParse({ transcript })

    if (!input.success) {
      return fail({
        code: "invalid_input",
        message: "Transcript mangler eller er ugyldigt.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const brief = await generateContentBriefFromTranscript(input.data.transcript)

    logActionInfo({
      requestId,
      actionName: ACTION_NAME,
      model: MASTER_MODEL,
      latencyMs: resolveLatencyMs(),
      message: "Transcript analyzed successfully.",
      metadata: {
        transcriptLength: input.data.transcript.length,
      },
    })

    return createActionSuccess(requestId, { brief })
  } catch (error: unknown) {
    return fail({
      code: "external_service_error",
      message: "Analyse fejlede. Prøv igen om et øjeblik.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}
