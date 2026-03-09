import "server-only"

import { z } from "zod"

import { runPublishConnector } from "@/features/scheduler/connectors"
import {
  createRequestId,
  logActionError,
  logActionInfo,
  logActionWarn,
} from "@/lib/observability/logger"
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import type { PublishJobStatus } from "@/lib/types/domain"

const ACTION_PUBLISH_WORKER = "scheduler.publish_worker.tick"
const MAX_SCAN_MULTIPLIER = 3
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const RETRY_BASE_DELAY_MS = 60_000
const FALLBACK_MAX_ATTEMPTS = 5

const workerRunInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  dryRun: z.boolean().default(false),
})

const dueJobSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  post_id: z.string().uuid(),
  platform: z.enum(["linkedin", "tiktok", "instagram", "facebook", "twitter"]),
  status: z.enum(["queued", "processing", "retrying", "failed", "published"]),
  attempt_count: z.number().int().min(0),
  max_attempts: z.number().int().min(1),
  next_retry_at: z.string().nullable(),
  created_at: z.string(),
})

const claimedJobSchema = dueJobSchema.omit({ created_at: true })

const postRowSchema = z.object({
  id: z.string().uuid(),
  publish_mode: z.enum(["api", "manual_copy"]),
  status: z.enum(["draft", "approved", "scheduled", "posted"]),
})

type PublishWorkerResult = {
  success: boolean
  requestId: string
  message: string
  processedCount: number
  claimedCount: number
  publishedCount: number
  deferredCount: number
  retryingCount: number
  failedCount: number
  skippedCount: number
  dueCount: number
  dryRun: boolean
}

function computeRetryDelayMs(attemptCount: number): number {
  const safeAttempt = Math.max(1, attemptCount)
  return RETRY_BASE_DELAY_MS * 2 ** (safeAttempt - 1)
}

function computeNextRetryAt(attemptCount: number): string {
  const retryAt = new Date(Date.now() + computeRetryDelayMs(attemptCount))
  return retryAt.toISOString()
}

function isDue(nextRetryAt: string | null, nowMs: number): boolean {
  if (!nextRetryAt) {
    return true
  }

  const parsed = new Date(nextRetryAt).getTime()
  if (Number.isNaN(parsed)) {
    return true
  }

  return parsed <= nowMs
}

function clampErrorMessage(message: string): string {
  return message.trim().slice(0, 400)
}

export async function runPublishWorker(rawInput: unknown): Promise<PublishWorkerResult> {
  const requestId = createRequestId()
  const startedAt = Date.now()

  const createSummary = (input: {
    success: boolean
    message: string
    processedCount?: number
    claimedCount?: number
    publishedCount?: number
    deferredCount?: number
    retryingCount?: number
    failedCount?: number
    skippedCount?: number
    dueCount?: number
    dryRun?: boolean
  }): PublishWorkerResult => ({
    success: input.success,
    requestId,
    message: input.message,
    processedCount: input.processedCount ?? 0,
    claimedCount: input.claimedCount ?? 0,
    publishedCount: input.publishedCount ?? 0,
    deferredCount: input.deferredCount ?? 0,
    retryingCount: input.retryingCount ?? 0,
    failedCount: input.failedCount ?? 0,
    skippedCount: input.skippedCount ?? 0,
    dueCount: input.dueCount ?? 0,
    dryRun: input.dryRun ?? false,
  })

  const parsedInput = workerRunInputSchema.safeParse(rawInput)
  if (!parsedInput.success) {
    logActionWarn({
      requestId,
      actionName: ACTION_PUBLISH_WORKER,
      message: "Worker input validation failed.",
      errorCode: "invalid_input",
      metadata: {
        issueCount: parsedInput.error.issues.length,
      },
      latencyMs: Date.now() - startedAt,
    })

    return createSummary({
      success: false,
      message: "Worker input er ugyldigt.",
    })
  }

  const { limit, dryRun } = parsedInput.data

  if (!isSupabaseConfigured() || !isSupabaseAdminConfigured()) {
    logActionWarn({
      requestId,
      actionName: ACTION_PUBLISH_WORKER,
      message: "Worker is missing Supabase admin configuration.",
      errorCode: "missing_dependency",
      metadata: {
        hasPublicSupabaseConfig: isSupabaseConfigured(),
        hasServiceRoleKey: isSupabaseAdminConfigured(),
      },
      latencyMs: Date.now() - startedAt,
    })

    return createSummary({
      success: false,
      message:
        "Worker mangler Supabase admin-konfiguration (SUPABASE_SERVICE_ROLE_KEY).",
      dryRun,
    })
  }

  const supabase = createSupabaseAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const nowMs = now.getTime()
  const scanLimit = Math.min(MAX_LIMIT * MAX_SCAN_MULTIPLIER, limit * MAX_SCAN_MULTIPLIER)

  let processedCount = 0
  let claimedCount = 0
  let publishedCount = 0
  let deferredCount = 0
  let retryingCount = 0
  let failedCount = 0
  let skippedCount = 0

  const { data: candidateRows, error: candidateError } = await supabase
    .from("publish_jobs")
    .select(
      "id, user_id, workflow_id, post_id, platform, status, attempt_count, max_attempts, next_retry_at, created_at"
    )
    .in("status", ["queued", "retrying"])
    .order("created_at", { ascending: true })
    .limit(scanLimit)

  if (candidateError) {
    logActionError({
      requestId,
      actionName: ACTION_PUBLISH_WORKER,
      message: "Could not fetch candidate publish jobs.",
      errorCode: "database_error",
      errorType: candidateError.code,
      latencyMs: Date.now() - startedAt,
    })

    return createSummary({
      success: false,
      message: "Kunne ikke hente publish job kandidater.",
      dryRun,
    })
  }

  const parsedCandidates = z.array(dueJobSchema).safeParse(candidateRows ?? [])
  if (!parsedCandidates.success) {
    logActionError({
      requestId,
      actionName: ACTION_PUBLISH_WORKER,
      message: "Candidate publish jobs failed validation.",
      errorCode: "validation_failed",
      metadata: {
        issueCount: parsedCandidates.error.issues.length,
      },
      latencyMs: Date.now() - startedAt,
    })

    return createSummary({
      success: false,
      message: "Publish job kandidater kunne ikke valideres.",
      dryRun,
    })
  }

  const dueJobs = parsedCandidates.data
    .filter((job) => isDue(job.next_retry_at, nowMs))
    .slice(0, limit)

  if (dryRun) {
    logActionInfo({
      requestId,
      actionName: ACTION_PUBLISH_WORKER,
      message: "Worker dry-run completed.",
      metadata: {
        candidateCount: parsedCandidates.data.length,
        dueCount: dueJobs.length,
        limit,
      },
      latencyMs: Date.now() - startedAt,
    })

    return createSummary({
      success: true,
      message: "Dry-run gennemført.",
      dueCount: dueJobs.length,
      dryRun: true,
    })
  }

  for (const dueJob of dueJobs) {
    const { data: claimedJobRow, error: claimError } = await supabase
      .from("publish_jobs")
      .update({
        status: "processing",
      })
      .eq("id", dueJob.id)
      .eq("user_id", dueJob.user_id)
      .in("status", ["queued", "retrying"])
      .select(
        "id, user_id, workflow_id, post_id, platform, status, attempt_count, max_attempts, next_retry_at"
      )
      .maybeSingle()

    if (claimError) {
      skippedCount += 1
      logActionWarn({
        requestId,
        actionName: ACTION_PUBLISH_WORKER,
        userId: dueJob.user_id,
        workflowId: dueJob.workflow_id,
        platform: dueJob.platform,
        message: "Could not claim due publish job.",
        errorCode: "database_error",
        errorType: claimError.code,
        latencyMs: Date.now() - startedAt,
      })
      continue
    }

    if (!claimedJobRow) {
      skippedCount += 1
      continue
    }

    const parsedClaimedJob = claimedJobSchema.safeParse(claimedJobRow)
    if (!parsedClaimedJob.success) {
      skippedCount += 1
      logActionWarn({
        requestId,
        actionName: ACTION_PUBLISH_WORKER,
        userId: dueJob.user_id,
        workflowId: dueJob.workflow_id,
        platform: dueJob.platform,
        message: "Claimed job failed validation and was skipped.",
        errorCode: "validation_failed",
        metadata: {
          issueCount: parsedClaimedJob.error.issues.length,
        },
        latencyMs: Date.now() - startedAt,
      })
      continue
    }

    claimedCount += 1
    const claimedJob = parsedClaimedJob.data

    const { data: postRow, error: postLookupError } = await supabase
      .from("posts")
      .select("id, publish_mode, status")
      .eq("id", claimedJob.post_id)
      .eq("user_id", claimedJob.user_id)
      .maybeSingle()

    if (postLookupError || !postRow) {
      const nextAttempt = claimedJob.attempt_count + 1
      const maxAttempts = Math.min(claimedJob.max_attempts, FALLBACK_MAX_ATTEMPTS)
      const canRetry = nextAttempt < maxAttempts
      const nextStatus: PublishJobStatus = canRetry ? "retrying" : "failed"
      const nextRetryAt = canRetry ? computeNextRetryAt(nextAttempt) : null

      await supabase
        .from("publish_jobs")
        .update({
          status: nextStatus,
          attempt_count: nextAttempt,
          next_retry_at: nextRetryAt,
          last_error: "Kunne ikke hente post til publish job.",
          dead_lettered_at: canRetry ? null : nowIso,
        })
        .eq("id", claimedJob.id)
        .eq("user_id", claimedJob.user_id)
        .eq("status", "processing")

      if (canRetry) {
        retryingCount += 1
      } else {
        failedCount += 1
      }

      processedCount += 1
      continue
    }

    const parsedPost = postRowSchema.safeParse(postRow)
    if (!parsedPost.success) {
      await supabase
        .from("publish_jobs")
        .update({
          status: "failed",
          attempt_count: claimedJob.attempt_count + 1,
          next_retry_at: null,
          last_error: "Post data kunne ikke valideres under processing.",
          dead_lettered_at: nowIso,
        })
        .eq("id", claimedJob.id)
        .eq("user_id", claimedJob.user_id)
        .eq("status", "processing")

      failedCount += 1
      processedCount += 1
      continue
    }

    const connectorResult = await runPublishConnector({
      platform: claimedJob.platform,
      publishMode: parsedPost.data.publish_mode,
      postStatus: parsedPost.data.status,
    })

    if (connectorResult.outcome === "success") {
      await supabase
        .from("publish_jobs")
        .update({
          status: "published",
          next_retry_at: null,
          last_error: null,
          dead_lettered_at: null,
          published_at: nowIso,
        })
        .eq("id", claimedJob.id)
        .eq("user_id", claimedJob.user_id)
        .eq("status", "processing")

      publishedCount += 1
      processedCount += 1
      continue
    }

    if (connectorResult.outcome === "deferred") {
      const deferredRetryAt = new Date(Date.now() + connectorResult.delayMs).toISOString()
      await supabase
        .from("publish_jobs")
        .update({
          status: "queued",
          next_retry_at: deferredRetryAt,
          last_error: clampErrorMessage(connectorResult.message),
        })
        .eq("id", claimedJob.id)
        .eq("user_id", claimedJob.user_id)
        .eq("status", "processing")

      deferredCount += 1
      processedCount += 1
      continue
    }

    const nextAttempt = claimedJob.attempt_count + 1
    const maxAttempts = Math.min(claimedJob.max_attempts, FALLBACK_MAX_ATTEMPTS)
    const canRetry = connectorResult.outcome === "retryable_error" && nextAttempt < maxAttempts
    const nextStatus: PublishJobStatus = canRetry ? "retrying" : "failed"
    const nextRetryAt = canRetry ? computeNextRetryAt(nextAttempt) : null
    const deadLetteredAt = canRetry ? null : nowIso

    await supabase
      .from("publish_jobs")
      .update({
        status: nextStatus,
        attempt_count: nextAttempt,
        next_retry_at: nextRetryAt,
        last_error: clampErrorMessage(connectorResult.message),
        dead_lettered_at: deadLetteredAt,
      })
      .eq("id", claimedJob.id)
      .eq("user_id", claimedJob.user_id)
      .eq("status", "processing")

    if (canRetry) {
      retryingCount += 1
    } else {
      failedCount += 1
    }
    processedCount += 1
  }

  logActionInfo({
    requestId,
    actionName: ACTION_PUBLISH_WORKER,
    message: "Publish worker finished.",
    metadata: {
      dueCount: dueJobs.length,
      claimedCount,
      processedCount,
      publishedCount,
      deferredCount,
      retryingCount,
      failedCount,
      skippedCount,
      limit,
      dryRun,
    },
    latencyMs: Date.now() - startedAt,
  })

  return createSummary({
    success: true,
    message: "Worker run completed.",
    processedCount,
    claimedCount,
    publishedCount,
    deferredCount,
    retryingCount,
    failedCount,
    skippedCount,
    dueCount: dueJobs.length,
    dryRun,
  })
}
