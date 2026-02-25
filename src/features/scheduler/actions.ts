"use server"

import { z } from "zod"

import {
  agentOutputSchema,
  contentBriefSchema,
  planStatusSchema,
  platformSchema,
} from "@/lib/schemas/domain"
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
import { resolveCurrentUserId } from "@/lib/supabase/auth"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { PlanStatus } from "@/lib/types/domain"

const isoDateTimeSchema = z.string().datetime()

const upsertPostPlanInputSchema = z.object({
  workflowId: z.string().uuid(),
  transcript: z.string().trim(),
  brief: contentBriefSchema,
  draft: agentOutputSchema,
  scheduledFor: isoDateTimeSchema.nullable(),
})

const updatePostPlanStatusInputSchema = z
  .object({
    workflowId: z.string().uuid(),
    platform: platformSchema,
    status: planStatusSchema,
    scheduledFor: isoDateTimeSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "scheduled" && !value.scheduledFor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduledFor er påkrævet når status er scheduled.",
        path: ["scheduledFor"],
      })
    }
  })

type SchedulerActionResult = ActionResult<{
  persisted: boolean
}>

const ACTION_UPSERT_POST_PLAN = "scheduler.upsert_post_plan"
const ACTION_UPDATE_POST_PLAN_STATUS = "scheduler.update_post_plan_status"

function toPostStatusFromPlanStatus(
  status: PlanStatus
): "approved" | "scheduled" | "posted" {
  if (status === "pending") {
    return "approved"
  }
  if (status === "scheduled") {
    return "scheduled"
  }
  return "posted"
}

export async function upsertPostPlanAction(
  rawInput: unknown
): Promise<SchedulerActionResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()
  const resolveLatencyMs = () => Date.now() - startedAt
  let workflowId: string | null = null
  let platform: string | null = null

  const fail = (input: {
    code:
      | "invalid_input"
      | "missing_dependency"
      | "unauthorized"
      | "database_error"
      | "internal_error"
    message: string
    retryable: boolean
    userId?: string | null
    workflowId?: string | null
    platform?: string | null
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
      actionName: ACTION_UPSERT_POST_PLAN,
      userId: input.userId ?? null,
      workflowId: input.workflowId ?? workflowId,
      platform: input.platform ?? platform,
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
    if (!isSupabaseConfigured()) {
      return fail({
        code: "missing_dependency",
        message: "Supabase er ikke konfigureret. Kan ikke gemme post-plan.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const parsedInput = upsertPostPlanInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return fail({
        code: "invalid_input",
        message: "Plan-data kunne ikke valideres.",
        retryable: false,
        logLevel: "warn",
        metadata: {
          issueCount: parsedInput.error.issues.length,
        },
      })
    }

    const input = parsedInput.data
    workflowId = input.workflowId
    platform = input.draft.platform

    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)

    if (!userId) {
      return fail({
        code: "unauthorized",
        message: "Du skal være logget ind for at gemme post-planer.",
        retryable: false,
        workflowId: input.workflowId,
        platform: input.draft.platform,
        logLevel: "warn",
      })
    }

    const transcript =
      input.transcript.trim().length > 0
        ? input.transcript.trim()
        : input.brief.coreMessage

    const { data: briefRow, error: briefError } = await supabase
      .from("briefs")
      .upsert(
        {
          user_id: userId,
          workflow_id: input.workflowId,
          source_transcript: transcript,
          core_message: input.brief.coreMessage,
          intent: input.brief.intent,
          target_audience: input.brief.targetAudience,
          key_points: input.brief.keyPoints,
          emotional_tone: input.brief.emotionalTone,
        },
        { onConflict: "user_id,workflow_id" }
      )
      .select("id")
      .single()

    if (briefError || !briefRow?.id) {
      return fail({
        code: "database_error",
        message: "Kunne ikke gemme ContentBrief i databasen.",
        retryable: true,
        userId,
        workflowId: input.workflowId,
        platform: input.draft.platform,
        errorType: briefError?.code ?? undefined,
      })
    }

    const postStatus: "approved" | "scheduled" | "posted" =
      input.draft.status === "posted"
        ? "posted"
        : input.scheduledFor !== null || input.draft.status === "scheduled"
          ? "scheduled"
          : "approved"

    const { error: postError } = await supabase.from("posts").upsert(
      {
        user_id: userId,
        brief_id: briefRow.id,
        workflow_id: input.workflowId,
        platform: input.draft.platform,
        hook: input.draft.hook,
        body: input.draft.body,
        cta: input.draft.cta,
        hashtags: input.draft.hashtags,
        visual_suggestion: input.draft.visualSuggestion,
        publish_mode: "manual_copy",
        status: postStatus,
        scheduled_for: input.scheduledFor,
        posted_at: postStatus === "posted" ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,workflow_id,platform" }
    )

    if (postError) {
      return fail({
        code: "database_error",
        message: "Kunne ikke gemme post-plan i databasen.",
        retryable: true,
        userId,
        workflowId: input.workflowId,
        platform: input.draft.platform,
        errorType: postError.code,
      })
    }

    logActionInfo({
      requestId,
      actionName: ACTION_UPSERT_POST_PLAN,
      userId,
      workflowId: input.workflowId,
      platform: input.draft.platform,
      latencyMs: resolveLatencyMs(),
      message: "Post plan upserted successfully.",
      metadata: {
        postStatus,
        hasSchedule: input.scheduledFor !== null,
      },
    })

    return createActionSuccess(requestId, { persisted: true })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under gemning af post-plan.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}

export async function updatePersistedPostPlanStatusAction(
  rawInput: unknown
): Promise<SchedulerActionResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()
  const resolveLatencyMs = () => Date.now() - startedAt
  let workflowId: string | null = null
  let platform: string | null = null

  const fail = (input: {
    code:
      | "invalid_input"
      | "missing_dependency"
      | "unauthorized"
      | "not_found"
      | "database_error"
      | "internal_error"
    message: string
    retryable: boolean
    userId?: string | null
    workflowId?: string | null
    platform?: string | null
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
      actionName: ACTION_UPDATE_POST_PLAN_STATUS,
      userId: input.userId ?? null,
      workflowId: input.workflowId ?? workflowId,
      platform: input.platform ?? platform,
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
    if (!isSupabaseConfigured()) {
      return fail({
        code: "missing_dependency",
        message: "Supabase er ikke konfigureret. Kan ikke opdatere post-plan.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const parsedInput = updatePostPlanStatusInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return fail({
        code: "invalid_input",
        message: "Status-opdatering kunne ikke valideres.",
        retryable: false,
        logLevel: "warn",
        metadata: {
          issueCount: parsedInput.error.issues.length,
        },
      })
    }

    const input = parsedInput.data
    workflowId = input.workflowId
    platform = input.platform

    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)

    if (!userId) {
      return fail({
        code: "unauthorized",
        message: "Du skal være logget ind for at opdatere post-planer.",
        retryable: false,
        workflowId: input.workflowId,
        platform: input.platform,
        logLevel: "warn",
      })
    }

    const postStatus = toPostStatusFromPlanStatus(input.status)

    const updatePayload: {
      status: "approved" | "scheduled" | "posted"
      scheduled_for: string | null
      posted_at: string | null
    } = {
      status: postStatus,
      scheduled_for: input.status === "scheduled" ? input.scheduledFor ?? null : null,
      posted_at: input.status === "posted" ? new Date().toISOString() : null,
    }

    const { data, error } = await supabase
      .from("posts")
      .update(updatePayload)
      .eq("user_id", userId)
      .eq("workflow_id", input.workflowId)
      .eq("platform", input.platform)
      .select("id")
      .maybeSingle()

    if (error) {
      return fail({
        code: "database_error",
        message: "Kunne ikke opdatere post-plan i databasen.",
        retryable: true,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
        errorType: error.code,
      })
    }

    if (!data) {
      return fail({
        code: "not_found",
        message: "Ingen eksisterende post-plan fundet til opdatering.",
        retryable: false,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
        logLevel: "warn",
      })
    }

    logActionInfo({
      requestId,
      actionName: ACTION_UPDATE_POST_PLAN_STATUS,
      userId,
      workflowId: input.workflowId,
      platform: input.platform,
      latencyMs: resolveLatencyMs(),
      message: "Post plan status updated successfully.",
      metadata: {
        status: input.status,
        postStatus,
        hasSchedule: updatePayload.scheduled_for !== null,
      },
    })

    return createActionSuccess(requestId, { persisted: true })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under opdatering af post-plan.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}
