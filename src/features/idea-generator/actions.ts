"use server"

import {
  buildFallbackIdeas,
  generateIdeasFromBlueprint,
  type IdeaGeneratorOutput,
} from "@/lib/agents/idea-generator"
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

import { getActiveBrandBlueprintForCurrentUser } from "@/features/brand-blueprint/service"
import { generateIdeasInputSchema } from "./schema"

const ACTION_GENERATE_IDEAS = "idea_generator.generate"
const IDEA_MODEL = "gpt-4o"

type GenerateIdeasResult = ActionResult<{
  ideas: IdeaGeneratorOutput
}>

export async function generateIdeasAction(rawInput: unknown): Promise<GenerateIdeasResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()
  const resolveLatencyMs = () => Date.now() - startedAt

  const fail = (input: {
    code:
      | "invalid_input"
      | "not_found"
      | "forbidden"
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
      actionName: ACTION_GENERATE_IDEAS,
      model: IDEA_MODEL,
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
    const parsedInput = generateIdeasInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return fail({
        code: "invalid_input",
        message: "Idea input kunne ikke valideres.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const activeBlueprint = await getActiveBrandBlueprintForCurrentUser()
    if (!activeBlueprint) {
      return fail({
        code: "not_found",
        message: "Ingen Brand Blueprint fundet endnu.",
        retryable: false,
        logLevel: "warn",
      })
    }

    if (activeBlueprint.status !== "approved") {
      return fail({
        code: "forbidden",
        message: "Brand Blueprint skal være godkendt før idé-generering.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const ideas = await (async () => {
      if (!isOpenAIConfigured()) {
        return buildFallbackIdeas(activeBlueprint.blueprint, parsedInput.data.ideasPerPillar)
      }

      try {
        return await generateIdeasFromBlueprint({
          blueprint: activeBlueprint.blueprint,
          ideasPerPillar: parsedInput.data.ideasPerPillar,
        })
      } catch {
        return buildFallbackIdeas(activeBlueprint.blueprint, parsedInput.data.ideasPerPillar)
      }
    })()

    logActionInfo({
      requestId,
      actionName: ACTION_GENERATE_IDEAS,
      userId: activeBlueprint.userId,
      model: IDEA_MODEL,
      latencyMs: resolveLatencyMs(),
      message: "Ideas generated from approved Brand Blueprint.",
      metadata: {
        ideasPerPillar: parsedInput.data.ideasPerPillar,
      },
    })

    return createActionSuccess(requestId, { ideas })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under idé-generering.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}
