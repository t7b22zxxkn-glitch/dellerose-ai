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
import type { PlanStatus, Platform, PostPlan, PublishJobStatus } from "@/lib/types/domain"

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
  publishJob: PostPlan["publishJob"]
}>

const ACTION_UPSERT_POST_PLAN = "scheduler.upsert_post_plan"
const ACTION_UPDATE_POST_PLAN_STATUS = "scheduler.update_post_plan_status"
const ACTION_ENQUEUE_PUBLISH_JOB = "scheduler.enqueue_publish_job"
const ACTION_PROCESS_PUBLISH_JOB_ATTEMPT = "scheduler.process_publish_job_attempt"
const ACTION_REQUEUE_PUBLISH_JOB = "scheduler.requeue_publish_job"

const PUBLISH_JOB_MAX_ATTEMPTS = 5
const RETRY_BASE_DELAY_MS = 60_000

const enqueuePublishJobInputSchema = z.object({
  workflowId: z.string().uuid(),
  platform: platformSchema,
  scheduledFor: isoDateTimeSchema.nullable().optional(),
})

const requeuePublishJobInputSchema = z.object({
  workflowId: z.string().uuid(),
  platform: platformSchema,
})

const processPublishJobAttemptInputSchema = z
  .object({
    jobId: z.string().uuid(),
    outcome: z.enum(["success", "retryable_error", "fatal_error"]),
    errorMessage: z.string().trim().max(400).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.outcome !== "success" && !value.errorMessage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "errorMessage er påkrævet ved fejl-udfald.",
        path: ["errorMessage"],
      })
    }
  })

type EnqueuePublishJobActionResult = ActionResult<{
  jobId: string
  publishJob: NonNullable<PostPlan["publishJob"]>
  idempotencyKey: string
}>

type ProcessPublishJobAttemptActionResult = ActionResult<{
  jobId: string
  status: PublishJobStatus
  attemptCount: number
  nextRetryAt: string | null
  deadLettered: boolean
}>

type RequeuePublishJobActionResult = ActionResult<{
  publishJob: NonNullable<PostPlan["publishJob"]>
}>

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

function computeRetryDelayMs(attemptCount: number): number {
  const safeAttempt = Math.max(1, attemptCount)
  return RETRY_BASE_DELAY_MS * 2 ** (safeAttempt - 1)
}

function computeNextRetryAt(attemptCount: number): string | null {
  if (attemptCount >= PUBLISH_JOB_MAX_ATTEMPTS) {
    return null
  }

  const retryAt = new Date(Date.now() + computeRetryDelayMs(attemptCount))
  return retryAt.toISOString()
}

function resolveInitialNextRetryAt(scheduledFor: string | null | undefined): string | null {
  if (!scheduledFor) {
    return null
  }

  const parsed = new Date(scheduledFor)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  if (parsed.getTime() <= Date.now()) {
    return null
  }

  return parsed.toISOString()
}

function createPublishJobIdempotencyKey(input: {
  workflowId: string
  platform: Platform
  scheduledFor: string | null
}): string {
  const scheduleMarker = input.scheduledFor ?? "manual"
  return `${input.workflowId}:${input.platform}:${scheduleMarker}`
}

function toPublishJobSnapshot(input: {
  status: PublishJobStatus
  attemptCount: number
  nextRetryAt: string | null
  lastError: string | null
  updatedAt: string | null
}): NonNullable<PostPlan["publishJob"]> {
  return {
    status: input.status,
    attemptCount: input.attemptCount,
    nextRetryAt: input.nextRetryAt,
    lastError: input.lastError,
    updatedAt: input.updatedAt,
  }
}

export async function enqueuePublishJobAction(
  rawInput: unknown
): Promise<EnqueuePublishJobActionResult> {
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
      | "validation_failed"
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
      actionName: ACTION_ENQUEUE_PUBLISH_JOB,
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
        message: "Supabase er ikke konfigureret. Kan ikke oprette publish job.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const parsedInput = enqueuePublishJobInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return fail({
        code: "invalid_input",
        message: "Publish job input kunne ikke valideres.",
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
        message: "Du skal være logget ind for at oprette publish jobs.",
        retryable: false,
        workflowId: input.workflowId,
        platform: input.platform,
        logLevel: "warn",
      })
    }

    const idempotencyKey = createPublishJobIdempotencyKey({
      workflowId: input.workflowId,
      platform: input.platform,
      scheduledFor: input.scheduledFor ?? null,
    })

    const publishJobRowSchema = z.object({
      id: z.string().uuid(),
      status: z.enum(["queued", "processing", "retrying", "failed", "published"]),
      attempt_count: z.number().int().min(0),
      next_retry_at: z.string().nullable(),
      last_error: z.string().nullable(),
      updated_at: z.string().nullable(),
    })

    const { data: existingJob, error: existingJobError } = await supabase
      .from("publish_jobs")
      .select("id, status, attempt_count, next_retry_at, last_error, updated_at")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()

    if (existingJobError) {
      return fail({
        code: "database_error",
        message: "Kunne ikke kontrollere eksisterende publish job.",
        retryable: true,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
        errorType: existingJobError.code,
      })
    }

    if (existingJob) {
      const parsedExisting = publishJobRowSchema.safeParse(existingJob)
      if (!parsedExisting.success) {
        return fail({
          code: "validation_failed",
          message: "Eksisterende publish job kunne ikke valideres.",
          retryable: false,
          userId,
          workflowId: input.workflowId,
          platform: input.platform,
        })
      }

      const publishJob = toPublishJobSnapshot({
        status: parsedExisting.data.status,
        attemptCount: parsedExisting.data.attempt_count,
        nextRetryAt: parsedExisting.data.next_retry_at,
        lastError: parsedExisting.data.last_error,
        updatedAt: parsedExisting.data.updated_at,
      })

      logActionInfo({
        requestId,
        actionName: ACTION_ENQUEUE_PUBLISH_JOB,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
        latencyMs: resolveLatencyMs(),
        message: "Publish job already exists for idempotency key.",
        metadata: {
          idempotencyKey,
          reusedExisting: true,
          status: publishJob.status,
        },
      })

      return createActionSuccess(requestId, {
        jobId: parsedExisting.data.id,
        publishJob,
        idempotencyKey,
      })
    }

    const { data: postRow, error: postLookupError } = await supabase
      .from("posts")
      .select("id, status")
      .eq("user_id", userId)
      .eq("workflow_id", input.workflowId)
      .eq("platform", input.platform)
      .maybeSingle()

    if (postLookupError) {
      return fail({
        code: "database_error",
        message: "Kunne ikke slå post op før oprettelse af publish job.",
        retryable: true,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
        errorType: postLookupError.code,
      })
    }

    if (!postRow?.id) {
      return fail({
        code: "not_found",
        message: "Ingen post-plan fundet til publish job.",
        retryable: false,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
        logLevel: "warn",
      })
    }

    const { data: insertedJob, error: insertError } = await supabase
      .from("publish_jobs")
      .insert({
        user_id: userId,
        workflow_id: input.workflowId,
        platform: input.platform,
        post_id: postRow.id,
        idempotency_key: idempotencyKey,
        status: "queued",
        attempt_count: 0,
        max_attempts: PUBLISH_JOB_MAX_ATTEMPTS,
        next_retry_at: resolveInitialNextRetryAt(input.scheduledFor),
        last_error: null,
        dead_lettered_at: null,
        published_at: null,
      })
      .select("id, status, attempt_count, next_retry_at, last_error, updated_at")
      .single()

    if (insertError || !insertedJob) {
      return fail({
        code: "database_error",
        message: "Kunne ikke oprette publish job.",
        retryable: true,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
        errorType: insertError?.code,
      })
    }

    const parsedInserted = publishJobRowSchema.safeParse(insertedJob)
    if (!parsedInserted.success) {
      return fail({
        code: "validation_failed",
        message: "Nyt publish job kunne ikke valideres.",
        retryable: false,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
      })
    }

    const publishJob = toPublishJobSnapshot({
      status: parsedInserted.data.status,
      attemptCount: parsedInserted.data.attempt_count,
      nextRetryAt: parsedInserted.data.next_retry_at,
      lastError: parsedInserted.data.last_error,
      updatedAt: parsedInserted.data.updated_at,
    })

    logActionInfo({
      requestId,
      actionName: ACTION_ENQUEUE_PUBLISH_JOB,
      userId,
      workflowId: input.workflowId,
      platform: input.platform,
      latencyMs: resolveLatencyMs(),
      message: "Publish job enqueued successfully.",
      metadata: {
        idempotencyKey,
        jobId: parsedInserted.data.id,
        status: publishJob.status,
      },
    })

    return createActionSuccess(requestId, {
      jobId: parsedInserted.data.id,
      publishJob,
      idempotencyKey,
    })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under oprettelse af publish job.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
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

    return createActionSuccess(requestId, { persisted: true, publishJob: null })
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
    let publishJob: PostPlan["publishJob"] = null

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

    if (input.status === "scheduled") {
      const enqueueResult = await enqueuePublishJobAction({
        workflowId: input.workflowId,
        platform: input.platform,
        scheduledFor: input.scheduledFor ?? null,
      })

      if (!enqueueResult.success) {
        return enqueueResult
      }

      publishJob = enqueueResult.publishJob
    }

    if (input.status === "posted") {
      const { data: publishedJobs, error: publishJobUpdateError } = await supabase
        .from("publish_jobs")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          next_retry_at: null,
          last_error: null,
          dead_lettered_at: null,
        })
        .eq("user_id", userId)
        .eq("workflow_id", input.workflowId)
        .eq("platform", input.platform)
        .in("status", ["queued", "processing", "retrying"])
        .select("status, attempt_count, next_retry_at, last_error, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)

      if (publishJobUpdateError) {
        return fail({
          code: "database_error",
          message: "Kunne ikke synkronisere publish job til published.",
          retryable: true,
          userId,
          workflowId: input.workflowId,
          platform: input.platform,
          errorType: publishJobUpdateError.code,
        })
      }

      const latestPublishedJob = publishedJobs?.[0]
      if (latestPublishedJob) {
        publishJob = toPublishJobSnapshot({
          status: latestPublishedJob.status,
          attemptCount: latestPublishedJob.attempt_count,
          nextRetryAt: latestPublishedJob.next_retry_at,
          lastError: latestPublishedJob.last_error,
          updatedAt: latestPublishedJob.updated_at,
        })
      }
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
        publishJobStatus: publishJob?.status ?? null,
      },
    })

    return createActionSuccess(requestId, { persisted: true, publishJob })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under opdatering af post-plan.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}

export async function requeuePublishJobAction(
  rawInput: unknown
): Promise<RequeuePublishJobActionResult> {
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
      | "validation_failed"
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
      actionName: ACTION_REQUEUE_PUBLISH_JOB,
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
        message: "Supabase er ikke konfigureret. Kan ikke requeue publish job.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const parsedInput = requeuePublishJobInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return fail({
        code: "invalid_input",
        message: "Requeue input kunne ikke valideres.",
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
        message: "Du skal være logget ind for at requeue publish jobs.",
        retryable: false,
        workflowId: input.workflowId,
        platform: input.platform,
        logLevel: "warn",
      })
    }

    const publishJobRowSchema = z.object({
      id: z.string().uuid(),
      status: z.enum(["queued", "processing", "retrying", "failed", "published"]),
      attempt_count: z.number().int().min(0),
      next_retry_at: z.string().nullable(),
      last_error: z.string().nullable(),
      updated_at: z.string().nullable(),
    })

    const { data: failedJob, error: failedJobLookupError } = await supabase
      .from("publish_jobs")
      .select("id, status, attempt_count, next_retry_at, last_error, updated_at")
      .eq("user_id", userId)
      .eq("workflow_id", input.workflowId)
      .eq("platform", input.platform)
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (failedJobLookupError) {
      return fail({
        code: "database_error",
        message: "Kunne ikke slå failed publish job op til requeue.",
        retryable: true,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
        errorType: failedJobLookupError.code,
      })
    }

    if (!failedJob) {
      return fail({
        code: "not_found",
        message: "Ingen failed publish job fundet til requeue.",
        retryable: false,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
        logLevel: "warn",
      })
    }

    const { data: requeuedJob, error: requeueError } = await supabase
      .from("publish_jobs")
      .update({
        status: "queued",
        attempt_count: 0,
        next_retry_at: null,
        last_error: null,
        dead_lettered_at: null,
      })
      .eq("id", failedJob.id)
      .eq("user_id", userId)
      .select("id, status, attempt_count, next_retry_at, last_error, updated_at")
      .single()

    if (requeueError || !requeuedJob) {
      return fail({
        code: "database_error",
        message: "Kunne ikke flytte publish job tilbage til queue.",
        retryable: true,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
        errorType: requeueError?.code,
      })
    }

    const parsedRequeuedJob = publishJobRowSchema.safeParse(requeuedJob)
    if (!parsedRequeuedJob.success) {
      return fail({
        code: "validation_failed",
        message: "Requeued publish job kunne ikke valideres.",
        retryable: false,
        userId,
        workflowId: input.workflowId,
        platform: input.platform,
      })
    }

    const publishJob = toPublishJobSnapshot({
      status: parsedRequeuedJob.data.status,
      attemptCount: parsedRequeuedJob.data.attempt_count,
      nextRetryAt: parsedRequeuedJob.data.next_retry_at,
      lastError: parsedRequeuedJob.data.last_error,
      updatedAt: parsedRequeuedJob.data.updated_at,
    })

    logActionInfo({
      requestId,
      actionName: ACTION_REQUEUE_PUBLISH_JOB,
      userId,
      workflowId: input.workflowId,
      platform: input.platform,
      latencyMs: resolveLatencyMs(),
      message: "Failed publish job was manually requeued.",
      metadata: {
        publishJobStatus: publishJob.status,
      },
    })

    return createActionSuccess(requestId, { publishJob })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under requeue af publish job.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}

export async function processPublishJobAttemptAction(
  rawInput: unknown
): Promise<ProcessPublishJobAttemptActionResult> {
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
      | "validation_failed"
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
      actionName: ACTION_PROCESS_PUBLISH_JOB_ATTEMPT,
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
        message: "Supabase er ikke konfigureret. Kan ikke processere publish job.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const parsedInput = processPublishJobAttemptInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return fail({
        code: "invalid_input",
        message: "Publish job attempt input kunne ikke valideres.",
        retryable: false,
        logLevel: "warn",
        metadata: {
          issueCount: parsedInput.error.issues.length,
        },
      })
    }

    const input = parsedInput.data
    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)

    if (!userId) {
      return fail({
        code: "unauthorized",
        message: "Du skal være logget ind for at processere publish jobs.",
        retryable: false,
        logLevel: "warn",
      })
    }

    const publishJobRowSchema = z.object({
      id: z.string().uuid(),
      user_id: z.string().uuid(),
      workflow_id: z.string().uuid(),
      platform: platformSchema,
      status: z.enum(["queued", "processing", "retrying", "failed", "published"]),
      attempt_count: z.number().int().min(0),
      max_attempts: z.number().int().min(1),
    })

    const { data: existingJob, error: lookupError } = await supabase
      .from("publish_jobs")
      .select("id, user_id, workflow_id, platform, status, attempt_count, max_attempts")
      .eq("id", input.jobId)
      .eq("user_id", userId)
      .maybeSingle()

    if (lookupError) {
      return fail({
        code: "database_error",
        message: "Kunne ikke hente publish job før processing.",
        retryable: true,
        userId,
        errorType: lookupError.code,
      })
    }

    if (!existingJob) {
      return fail({
        code: "not_found",
        message: "Publish job blev ikke fundet.",
        retryable: false,
        userId,
        logLevel: "warn",
      })
    }

    const parsedJob = publishJobRowSchema.safeParse(existingJob)
    if (!parsedJob.success) {
      return fail({
        code: "validation_failed",
        message: "Publish job data kunne ikke valideres før processing.",
        retryable: false,
        userId,
      })
    }

    workflowId = parsedJob.data.workflow_id
    platform = parsedJob.data.platform

    if (parsedJob.data.status === "published" || parsedJob.data.status === "failed") {
      logActionWarn({
        requestId,
        actionName: ACTION_PROCESS_PUBLISH_JOB_ATTEMPT,
        userId,
        workflowId,
        platform,
        latencyMs: resolveLatencyMs(),
        errorCode: "validation_failed",
        message: "Publish job is terminal and cannot be processed again.",
      })

      return createActionSuccess(requestId, {
        jobId: parsedJob.data.id,
        status: parsedJob.data.status,
        attemptCount: parsedJob.data.attempt_count,
        nextRetryAt: null,
        deadLettered: parsedJob.data.status === "failed",
      })
    }

    if (input.outcome === "success") {
      const { data: updatedJob, error: successUpdateError } = await supabase
        .from("publish_jobs")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          next_retry_at: null,
          last_error: null,
          dead_lettered_at: null,
        })
        .eq("id", parsedJob.data.id)
        .eq("user_id", userId)
        .select("id, status, attempt_count, next_retry_at")
        .single()

      if (successUpdateError || !updatedJob) {
        return fail({
          code: "database_error",
          message: "Kunne ikke sætte publish job til published.",
          retryable: true,
          userId,
          workflowId,
          platform,
          errorType: successUpdateError?.code,
        })
      }

      return createActionSuccess(requestId, {
        jobId: updatedJob.id,
        status: updatedJob.status,
        attemptCount: updatedJob.attempt_count,
        nextRetryAt: updatedJob.next_retry_at,
        deadLettered: false,
      })
    }

    const nextAttemptCount = parsedJob.data.attempt_count + 1
    const maxAttempts = Math.min(parsedJob.data.max_attempts, PUBLISH_JOB_MAX_ATTEMPTS)
    const canRetry = input.outcome === "retryable_error" && nextAttemptCount < maxAttempts
    const nextStatus: PublishJobStatus = canRetry ? "retrying" : "failed"
    const nextRetryAt = canRetry ? computeNextRetryAt(nextAttemptCount) : null
    const deadLettered = !canRetry

    const { data: failedOrRetryingJob, error: failureUpdateError } = await supabase
      .from("publish_jobs")
      .update({
        status: nextStatus,
        attempt_count: nextAttemptCount,
        next_retry_at: nextRetryAt,
        last_error: input.errorMessage ?? "Ukendt publiceringsfejl.",
        dead_lettered_at: deadLettered ? new Date().toISOString() : null,
      })
      .eq("id", parsedJob.data.id)
      .eq("user_id", userId)
      .select("id, status, attempt_count, next_retry_at")
      .single()

    if (failureUpdateError || !failedOrRetryingJob) {
      return fail({
        code: "database_error",
        message: "Kunne ikke opdatere publish job efter processing-forsøg.",
        retryable: true,
        userId,
        workflowId,
        platform,
        errorType: failureUpdateError?.code,
      })
    }

    logActionInfo({
      requestId,
      actionName: ACTION_PROCESS_PUBLISH_JOB_ATTEMPT,
      userId,
      workflowId,
      platform,
      latencyMs: resolveLatencyMs(),
      message: "Publish job attempt processed.",
      metadata: {
        outcome: input.outcome,
        attemptCount: failedOrRetryingJob.attempt_count,
        maxAttempts,
        deadLettered,
      },
    })

    return createActionSuccess(requestId, {
      jobId: failedOrRetryingJob.id,
      status: failedOrRetryingJob.status,
      attemptCount: failedOrRetryingJob.attempt_count,
      nextRetryAt: failedOrRetryingJob.next_retry_at,
      deadLettered,
    })
  } catch (error: unknown) {
    return fail({
      code: "internal_error",
      message: "Uventet fejl under processing af publish job.",
      retryable: true,
      errorType: error instanceof Error ? error.name : "UnknownError",
    })
  }
}
