import "server-only"

import { z } from "zod"

import type { SchedulerOpsJobItem, SchedulerOpsSnapshot } from "@/features/scheduler/types"
import { resolveCurrentUserId } from "@/lib/supabase/auth"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

type SchedulerOpsQueryResult = {
  snapshot: SchedulerOpsSnapshot | null
  notice: string | null
}

const workflowIdSchema = z.string().uuid()

const publishJobRowSchema = z.object({
  id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  platform: z.enum(["linkedin", "tiktok", "instagram", "facebook", "twitter"]),
  status: z.enum(["queued", "processing", "retrying", "failed", "published"]),
  attempt_count: z.number().int().min(0),
  max_attempts: z.number().int().min(1),
  next_retry_at: z.string().nullable(),
  last_error: z.string().nullable(),
  dead_lettered_at: z.string().nullable(),
  updated_at: z.string(),
})

const DEFAULT_STATUS_COUNTS: SchedulerOpsSnapshot["statusCounts"] = {
  queued: 0,
  processing: 0,
  retrying: 0,
  failed: 0,
  published: 0,
}

function toIsoOrNull(value: string | null): string | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function toSchedulerOpsJobItem(row: z.infer<typeof publishJobRowSchema>): SchedulerOpsJobItem {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    platform: row.platform,
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRetryAt: toIsoOrNull(row.next_retry_at),
    lastError: row.last_error,
    deadLetteredAt: toIsoOrNull(row.dead_lettered_at),
    updatedAt: toIsoOrNull(row.updated_at) ?? new Date().toISOString(),
  }
}

export async function getSchedulerOpsSnapshot(
  workflowId?: string
): Promise<SchedulerOpsQueryResult> {
  if (!isSupabaseConfigured()) {
    return {
      snapshot: null,
      notice:
        "Supabase er ikke konfigureret endnu. Scheduler ops-overblik er ikke tilgængeligt.",
    }
  }

  if (workflowId) {
    const parsedWorkflowId = workflowIdSchema.safeParse(workflowId)
    if (!parsedWorkflowId.success) {
      return {
        snapshot: null,
        notice: "Workflow ID er ugyldigt for scheduler ops-overblik.",
      }
    }
  }

  try {
    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)

    if (!userId) {
      return {
        snapshot: null,
        notice: "Ingen aktiv bruger. Log ind for at se scheduler job-overblik.",
      }
    }

    let query = supabase
      .from("publish_jobs")
      .select(
        "id, workflow_id, platform, status, attempt_count, max_attempts, next_retry_at, last_error, dead_lettered_at, updated_at"
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(250)

    if (workflowId) {
      query = query.eq("workflow_id", workflowId)
    }

    const { data, error } = await query
    if (error) {
      return {
        snapshot: null,
        notice: "Kunne ikke hente scheduler job-overblik fra databasen.",
      }
    }

    const parsedRows = z.array(publishJobRowSchema).safeParse(data ?? [])
    if (!parsedRows.success) {
      return {
        snapshot: null,
        notice: "Scheduler job-overblik kunne ikke valideres.",
      }
    }

    if (parsedRows.data.length === 0) {
      return {
        snapshot: null,
        notice: "Ingen publish jobs fundet endnu for det valgte scope.",
      }
    }

    const statusCounts = { ...DEFAULT_STATUS_COUNTS }
    for (const row of parsedRows.data) {
      statusCounts[row.status] += 1
    }

    const attentionJobs = parsedRows.data
      .filter((row) => row.status === "retrying" || row.status === "failed")
      .slice(0, 8)
      .map(toSchedulerOpsJobItem)

    return {
      snapshot: {
        totalJobs: parsedRows.data.length,
        statusCounts,
        attentionJobs,
      },
      notice: null,
    }
  } catch {
    return {
      snapshot: null,
      notice: "Uventet fejl ved hentning af scheduler job-overblik.",
    }
  }
}
