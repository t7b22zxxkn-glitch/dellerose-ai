"use client"

import { z } from "zod"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { AgentOutput, ContentBrief, Platform, PostPlan } from "@/lib/types/domain"
import type {
  WorkflowChatItem,
  WorkflowChatRole,
  WorkflowSnapshot,
} from "@/features/workflow/types"

type WorkflowStoreState = {
  workflowId: string
  transcript: string
  brief: ContentBrief | null
  drafts: AgentOutput[]
  postPlans: PostPlan[]
  chatLog: WorkflowChatItem[]
  hydrateFromPersistedSnapshot: (snapshot: WorkflowSnapshot) => void
  setBrainDumpResult: (transcript: string, brief: ContentBrief) => void
  setDrafts: (drafts: AgentOutput[]) => void
  replaceDraft: (nextDraft: AgentOutput) => void
  updateDraftField: (
    platform: Platform,
    field: "hook" | "body" | "cta",
    value: string
  ) => void
  approveAndPlanDraft: (platform: Platform, scheduledFor: string | null) => void
  setPlanScheduled: (planId: string, scheduledFor: string) => void
  markPlanPosted: (planId: string) => void
  resetWorkflow: () => void
}

function createWorkflowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const randomValue = Math.floor(Math.random() * 16)
    const value = char === "x" ? randomValue : (randomValue & 0x3) | 0x8
    return value.toString(16)
  })
}

const workflowIdSchema = z.string().uuid()

function ensureValidWorkflowId(candidate: string | undefined): string {
  const parsed = workflowIdSchema.safeParse(candidate)
  if (parsed.success) {
    return parsed.data
  }
  return createWorkflowId()
}

const INITIAL_SNAPSHOT: WorkflowSnapshot = {
  workflowId: createWorkflowId(),
  transcript: "",
  brief: null,
  drafts: [],
  postPlans: [],
  chatLog: [],
}

function nowIso(): string {
  return new Date().toISOString()
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function appendChatLog(
  items: WorkflowChatItem[],
  role: WorkflowChatRole,
  message: string
): WorkflowChatItem[] {
  const nextItem: WorkflowChatItem = {
    id: createId(),
    role,
    message,
    createdAt: nowIso(),
  }

  return [...items, nextItem].slice(-120)
}

function toPostPlan(draft: AgentOutput, scheduledFor: string | null): PostPlan {
  return {
    id: createId(),
    platform: draft.platform,
    hook: draft.hook,
    body: draft.body,
    cta: draft.cta,
    hashtags: draft.hashtags,
    visualSuggestion: draft.visualSuggestion,
    status: scheduledFor ? "scheduled" : "pending",
    scheduledFor,
  }
}

function upsertPlanByPlatform(
  plans: PostPlan[],
  platform: Platform,
  nextPlan: PostPlan
): PostPlan[] {
  const index = plans.findIndex((plan) => plan.platform === platform)
  if (index < 0) {
    return [...plans, nextPlan]
  }

  const updated = [...plans]
  updated[index] = { ...nextPlan, id: updated[index].id }
  return updated
}

export const useWorkflowStore = create<WorkflowStoreState>()(
  persist(
    (set) => ({
      ...INITIAL_SNAPSHOT,
      hydrateFromPersistedSnapshot: (snapshot) => {
        set((state) => {
          if (state.drafts.length > 0 || state.brief) {
            return {}
          }

          return {
            workflowId: ensureValidWorkflowId(snapshot.workflowId),
            transcript: snapshot.transcript,
            brief: snapshot.brief,
            drafts: snapshot.drafts,
            postPlans: snapshot.postPlans,
            chatLog: appendChatLog(
              snapshot.chatLog,
              "system",
              "Workflow blev indlæst fra Supabase."
            ),
          }
        })
      },
      setBrainDumpResult: (transcript, brief) => {
        set((state) => ({
          workflowId: ensureValidWorkflowId(state.workflowId),
          transcript,
          brief,
          drafts: [],
          postPlans: [],
          chatLog: appendChatLog(
            appendChatLog(
              state.chatLog,
              "user",
              `Brain Dump transcript modtaget (${transcript.length} tegn).`
            ),
            "agent",
            "Master Agent har genereret et valideret ContentBrief."
          ),
        }))
      },
      setDrafts: (drafts) => {
        set((state) => ({
          workflowId: ensureValidWorkflowId(state.workflowId),
          drafts,
          chatLog: appendChatLog(
            state.chatLog,
            "agent",
            "Multi-Agent Engine genererede platform-drafts til 5 platforme."
          ),
        }))
      },
      replaceDraft: (nextDraft) => {
        set((state) => ({
          workflowId: ensureValidWorkflowId(state.workflowId),
          drafts: state.drafts.map((draft) =>
            draft.platform === nextDraft.platform ? nextDraft : draft
          ),
          chatLog: appendChatLog(
            state.chatLog,
            "agent",
            `Draft for ${nextDraft.platform} blev regenereret.`
          ),
        }))
      },
      updateDraftField: (platform, field, value) => {
        const normalizedValue = value.trim()

        set((state) => ({
          workflowId: ensureValidWorkflowId(state.workflowId),
          drafts: state.drafts.map((draft) => {
            if (draft.platform !== platform) {
              return draft
            }

            if (field === "hook") {
              return { ...draft, hook: normalizedValue }
            }
            if (field === "body") {
              return { ...draft, body: normalizedValue }
            }
            return { ...draft, cta: normalizedValue }
          }),
          chatLog: appendChatLog(
            state.chatLog,
            "system",
            `Feltet "${field}" blev redigeret på ${platform}-draft.`
          ),
        }))
      },
      approveAndPlanDraft: (platform, scheduledFor) => {
        set((state) => {
          const targetDraft = state.drafts.find((draft) => draft.platform === platform)

          if (!targetDraft) {
            return {}
          }

          const nextDraftStatus: AgentOutput["status"] = scheduledFor
            ? "scheduled"
            : "approved"
          const nextDraft: AgentOutput = { ...targetDraft, status: nextDraftStatus }
          const nextPlans = upsertPlanByPlatform(
            state.postPlans,
            platform,
            toPostPlan(nextDraft, scheduledFor)
          )

          return {
            workflowId: ensureValidWorkflowId(state.workflowId),
            drafts: state.drafts.map((draft) =>
              draft.platform === platform ? nextDraft : draft
            ),
            postPlans: nextPlans,
            chatLog: appendChatLog(
              state.chatLog,
              "system",
              scheduledFor
                ? `${platform}-draft blev godkendt og planlagt.`
                : `${platform}-draft blev godkendt og lagt i pending plan.`
            ),
          }
        })
      },
      setPlanScheduled: (planId, scheduledFor) => {
        set((state) => {
          const nextPlans: PostPlan[] = state.postPlans.map((plan): PostPlan => {
            if (plan.id !== planId) {
              return plan
            }

            return {
              ...plan,
              status: "scheduled",
              scheduledFor,
            }
          })

          const affectedPlatform =
            nextPlans.find((plan) => plan.id === planId)?.platform ?? null

          return {
            workflowId: ensureValidWorkflowId(state.workflowId),
            postPlans: nextPlans,
            drafts: state.drafts.map((draft) =>
              draft.platform === affectedPlatform
                ? { ...draft, status: "scheduled" }
                : draft
            ),
            chatLog: appendChatLog(
              state.chatLog,
              "system",
              "Et plan-item blev sat til scheduled."
            ),
          }
        })
      },
      markPlanPosted: (planId) => {
        set((state) => {
          const nextPlans: PostPlan[] = state.postPlans.map((plan): PostPlan => {
            if (plan.id !== planId) {
              return plan
            }

            return { ...plan, status: "posted" }
          })

          const affectedPlatform =
            nextPlans.find((plan) => plan.id === planId)?.platform ?? null

          return {
            workflowId: ensureValidWorkflowId(state.workflowId),
            postPlans: nextPlans,
            drafts: state.drafts.map((draft) =>
              draft.platform === affectedPlatform ? { ...draft, status: "posted" } : draft
            ),
            chatLog: appendChatLog(
              state.chatLog,
              "system",
              "Et plan-item blev markeret som posted."
            ),
          }
        })
      },
      resetWorkflow: () => {
        set(() => ({
          ...INITIAL_SNAPSHOT,
          workflowId: createWorkflowId(),
          chatLog: appendChatLog([], "system", "Workflow blev nulstillet."),
        }))
      },
    }),
    {
      name: "dellerose-workflow-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        workflowId: state.workflowId,
        transcript: state.transcript,
        brief: state.brief,
        drafts: state.drafts,
        postPlans: state.postPlans,
        chatLog: state.chatLog,
      }),
      migrate: (persistedState) => {
        const state =
          typeof persistedState === "object" && persistedState !== null
            ? (persistedState as Partial<WorkflowSnapshot>)
            : {}

        return {
          ...INITIAL_SNAPSHOT,
          ...state,
          workflowId: ensureValidWorkflowId(state.workflowId),
        } as WorkflowStoreState
      },
    }
  )
)

export function getWorkflowSnapshot(): WorkflowSnapshot {
  const state = useWorkflowStore.getState()
  return {
    workflowId: state.workflowId,
    transcript: state.transcript,
    brief: state.brief,
    drafts: state.drafts,
    postPlans: state.postPlans,
    chatLog: state.chatLog,
  }
}
