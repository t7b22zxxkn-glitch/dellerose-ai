import "server-only"

import { z } from "zod"

import { agentOutputSchema, contentBriefSchema, postPlanSchema } from "@/lib/schemas/domain"
import { resolveCurrentUserId } from "@/lib/supabase/auth"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type {
  PersistedWorkflowSnapshot,
  WorkflowListItem,
} from "@/features/workflow/types"

type WorkflowQueryResult = {
  snapshot: PersistedWorkflowSnapshot | null
  notice: string | null
}

type WorkflowListResult = {
  items: WorkflowListItem[]
  notice: string | null
}

const workflowIdSchema = z.string().uuid()

const briefRowSchema = z.object({
  workflow_id: z.string().uuid(),
  source_transcript: z.string(),
  core_message: z.string(),
  intent: z.enum(["sales", "storytelling", "educational", "debate", "update"]),
  target_audience: z.string(),
  key_points: z.array(z.string()),
  emotional_tone: z.string(),
  created_at: z.string().min(1),
})

const postRowSchema = z.object({
  platform: z.enum(["linkedin", "tiktok", "instagram", "facebook", "twitter"]),
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  hashtags: z.array(z.string()),
  visual_suggestion: z.string(),
  status: z.enum(["draft", "approved", "scheduled", "posted"]),
  scheduled_for: z.string().nullable(),
})

const workflowPostStateRowSchema = z.object({
  workflow_id: z.string().uuid(),
  status: z.enum(["draft", "approved", "scheduled", "posted"]),
})

const workflowListBriefRowSchema = z.object({
  workflow_id: z.string().uuid(),
  core_message: z.string(),
  intent: z.enum(["sales", "storytelling", "educational", "debate", "update"]),
  created_at: z.string().min(1),
})

function mapStatusToPlanStatus(
  status: "draft" | "approved" | "scheduled" | "posted"
): "pending" | "scheduled" | "posted" {
  if (status === "scheduled") {
    return "scheduled"
  }

  if (status === "posted") {
    return "posted"
  }

  return "pending"
}

function nowIso(): string {
  return new Date().toISOString()
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const randomValue = Math.floor(Math.random() * 16)
    const value = char === "x" ? randomValue : (randomValue & 0x3) | 0x8
    return value.toString(16)
  })
}

async function getSupabaseWithUser() {
  const supabase = await createSupabaseServerClient()
  const userId = await resolveCurrentUserId(supabase)
  return { supabase, userId }
}

function buildSnapshotFromRows(
  briefRow: z.infer<typeof briefRowSchema>,
  postRows: z.infer<typeof postRowSchema>[]
): PersistedWorkflowSnapshot {
  const brief = contentBriefSchema.parse({
    coreMessage: briefRow.core_message,
    intent: briefRow.intent,
    targetAudience: briefRow.target_audience,
    keyPoints: briefRow.key_points,
    emotionalTone: briefRow.emotional_tone,
  })

  const drafts = postRows.map((post) =>
    agentOutputSchema.parse({
      platform: post.platform,
      hook: post.hook,
      body: post.body,
      cta: post.cta,
      hashtags: post.hashtags,
      visualSuggestion: post.visual_suggestion,
      status: post.status,
    })
  )

  const postPlans = postRows.map((post) =>
    postPlanSchema.parse({
      id: createId(),
      platform: post.platform,
      hook: post.hook,
      body: post.body,
      cta: post.cta,
      hashtags: post.hashtags,
      visualSuggestion: post.visual_suggestion,
      status: mapStatusToPlanStatus(post.status),
      scheduledFor: post.scheduled_for,
    })
  )

  return {
    workflowId: briefRow.workflow_id,
    transcript: briefRow.source_transcript,
    brief,
    drafts,
    postPlans,
    chatLog: [
      {
        id: createId(),
        role: "system",
        message: "Workflow indlæst fra Supabase.",
        createdAt: nowIso(),
      },
    ],
  }
}

export async function getPersistedWorkflowList(
  limit = 12
): Promise<WorkflowListResult> {
  if (!isSupabaseConfigured()) {
    return {
      items: [],
      notice:
        "Supabase er ikke konfigureret endnu. Lokale data bruges indtil env-vars er sat.",
    }
  }

  try {
    const { supabase, userId } = await getSupabaseWithUser()

    if (!userId) {
      return {
        items: [],
        notice: "Ingen aktiv bruger. Log ind for at hente workflows.",
      }
    }

    const { data: briefRows, error: briefError } = await supabase
      .from("briefs")
      .select("workflow_id, core_message, intent, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (briefError) {
      return {
        items: [],
        notice: "Kunne ikke hente workflow-liste fra Supabase.",
      }
    }

    const parsedBriefRows = z.array(workflowListBriefRowSchema).safeParse(briefRows ?? [])
    if (!parsedBriefRows.success) {
      return {
        items: [],
        notice: "Workflow-liste kunne ikke valideres.",
      }
    }

    if (parsedBriefRows.data.length === 0) {
      return {
        items: [],
        notice: "Ingen persisted workflow fundet endnu.",
      }
    }

    const workflowIds = parsedBriefRows.data.map((brief) => brief.workflow_id)

    const { data: postStateRows, error: postsError } = await supabase
      .from("posts")
      .select("workflow_id, status")
      .eq("user_id", userId)
      .in("workflow_id", workflowIds)

    if (postsError) {
      return {
        items: [],
        notice: "Kunne ikke hente post-status for workflows.",
      }
    }

    const parsedPostStates = z
      .array(workflowPostStateRowSchema)
      .safeParse(postStateRows ?? [])

    if (!parsedPostStates.success) {
      return {
        items: [],
        notice: "Workflow post-status kunne ikke valideres.",
      }
    }

    const postStateByWorkflow = new Map<
      string,
      Array<z.infer<typeof workflowPostStateRowSchema>>
    >()

    for (const row of parsedPostStates.data) {
      const existingRows = postStateByWorkflow.get(row.workflow_id) ?? []
      existingRows.push(row)
      postStateByWorkflow.set(row.workflow_id, existingRows)
    }

    const items: WorkflowListItem[] = parsedBriefRows.data.map((brief) => {
      const rows = postStateByWorkflow.get(brief.workflow_id) ?? []
      const hasScheduledPosts = rows.some((row) => row.status === "scheduled")
      const hasPostedPosts = rows.some((row) => row.status === "posted")

      return {
        workflowId: brief.workflow_id,
        coreMessage: brief.core_message,
        intent: brief.intent,
        createdAt: brief.created_at,
        postCount: rows.length,
        hasScheduledPosts,
        hasPostedPosts,
      }
    })

    return { items, notice: null }
  } catch {
    return {
      items: [],
      notice: "Uventet fejl ved hentning af workflow-liste.",
    }
  }
}

export async function getPersistedWorkflowSnapshotById(
  workflowId: string
): Promise<WorkflowQueryResult> {
  if (!isSupabaseConfigured()) {
    return {
      snapshot: null,
      notice:
        "Supabase er ikke konfigureret endnu. Lokale data bruges indtil env-vars er sat.",
    }
  }

  const parsedWorkflowId = workflowIdSchema.safeParse(workflowId)
  if (!parsedWorkflowId.success) {
    return {
      snapshot: null,
      notice: "Workflow ID er ugyldigt.",
    }
  }

  try {
    const { supabase, userId } = await getSupabaseWithUser()

    if (!userId) {
      return {
        snapshot: null,
        notice: "Ingen aktiv bruger. Log ind for at hente persisted workflows.",
      }
    }

    const { data: postRows, error: postsError } = await supabase
      .from("posts")
      .select(
        "platform, hook, body, cta, hashtags, visual_suggestion, status, scheduled_for"
      )
      .eq("user_id", userId)
      .eq("workflow_id", parsedWorkflowId.data)
      .order("created_at", { ascending: true })

    if (postsError) {
      return {
        snapshot: null,
        notice: "Kunne ikke hente persisted posts fra Supabase.",
      }
    }

    const { data: briefRow, error: briefError } = await supabase
      .from("briefs")
      .select(
        "workflow_id, source_transcript, core_message, intent, target_audience, key_points, emotional_tone, created_at"
      )
      .eq("user_id", userId)
      .eq("workflow_id", parsedWorkflowId.data)
      .maybeSingle()

    if (briefError) {
      return {
        snapshot: null,
        notice: "Kunne ikke hente workflow brief fra Supabase.",
      }
    }

    if (!briefRow) {
      return {
        snapshot: null,
        notice: "Workflow blev ikke fundet.",
      }
    }

    const parsedBriefRow = briefRowSchema.safeParse(briefRow)
    if (!parsedBriefRow.success) {
      return {
        snapshot: null,
        notice: "Persisted brief kunne ikke valideres.",
      }
    }

    const parsedPostRows = z.array(postRowSchema).safeParse(postRows ?? [])
    if (!parsedPostRows.success) {
      return {
        snapshot: null,
        notice: "Persisted posts kunne ikke valideres.",
      }
    }

    return {
      snapshot: buildSnapshotFromRows(parsedBriefRow.data, parsedPostRows.data),
      notice: null,
    }
  } catch {
    return {
      snapshot: null,
      notice: "Uventet fejl ved hentning af persisted workflow.",
    }
  }
}

export async function getLatestPersistedWorkflow(): Promise<WorkflowQueryResult> {
  const list = await getPersistedWorkflowList(1)

  if (list.notice && list.items.length === 0) {
    return {
      snapshot: null,
      notice: list.notice,
    }
  }

  const latest = list.items[0]
  if (!latest) {
    return {
      snapshot: null,
      notice: "Ingen persisted workflow fundet endnu.",
    }
  }

  return getPersistedWorkflowSnapshotById(latest.workflowId)
}
