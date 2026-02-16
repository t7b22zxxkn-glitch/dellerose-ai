"use server"

import { z } from "zod"

import {
  agentOutputSchema,
  contentBriefSchema,
  planStatusSchema,
  platformSchema,
} from "@/lib/schemas/domain"
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

type SchedulerActionResult =
  | {
      success: true
    }
  | {
      success: false
      message: string
    }

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
  try {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        message: "Supabase er ikke konfigureret. Kan ikke gemme post-plan.",
      }
    }

    const parsedInput = upsertPostPlanInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return {
        success: false,
        message: "Plan-data kunne ikke valideres.",
      }
    }

    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)

    if (!userId) {
      return {
        success: false,
        message: "Du skal være logget ind for at gemme post-planer.",
      }
    }

    const input = parsedInput.data
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
      return {
        success: false,
        message: "Kunne ikke gemme ContentBrief i databasen.",
      }
    }

    const postStatus: "approved" | "scheduled" =
      input.scheduledFor !== null ? "scheduled" : "approved"

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
        posted_at: null,
      },
      { onConflict: "user_id,workflow_id,platform" }
    )

    if (postError) {
      return {
        success: false,
        message: "Kunne ikke gemme post-plan i databasen.",
      }
    }

    return { success: true }
  } catch {
    return {
      success: false,
      message: "Uventet fejl under gemning af post-plan.",
    }
  }
}

export async function updatePersistedPostPlanStatusAction(
  rawInput: unknown
): Promise<SchedulerActionResult> {
  try {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        message: "Supabase er ikke konfigureret. Kan ikke opdatere post-plan.",
      }
    }

    const parsedInput = updatePostPlanStatusInputSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      return {
        success: false,
        message: "Status-opdatering kunne ikke valideres.",
      }
    }

    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)

    if (!userId) {
      return {
        success: false,
        message: "Du skal være logget ind for at opdatere post-planer.",
      }
    }

    const input = parsedInput.data
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
      return {
        success: false,
        message: "Kunne ikke opdatere post-plan i databasen.",
      }
    }

    if (!data) {
      return {
        success: false,
        message: "Ingen eksisterende post-plan fundet til opdatering.",
      }
    }

    return { success: true }
  } catch {
    return {
      success: false,
      message: "Uventet fejl under opdatering af post-plan.",
    }
  }
}
