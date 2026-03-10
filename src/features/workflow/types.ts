import type {
  AgentOutput,
  ContentBrief,
  DraftQualityReport,
  Intent,
  PostPlan,
} from "@/lib/types/domain"

export type WorkflowChatRole = "system" | "user" | "agent"

export type WorkflowChatItem = {
  id: string
  role: WorkflowChatRole
  message: string
  createdAt: string
}

export type WorkflowSnapshot = {
  workflowId: string
  transcript: string
  brief: ContentBrief | null
  drafts: AgentOutput[]
  draftQualityReport: DraftQualityReport | null
  postPlans: PostPlan[]
  chatLog: WorkflowChatItem[]
}

export type PersistedWorkflowSnapshot = {
  workflowId: string
  transcript: string
  brief: ContentBrief
  drafts: AgentOutput[]
  draftQualityReport: DraftQualityReport | null
  postPlans: PostPlan[]
  chatLog: WorkflowChatItem[]
}

export type WorkflowListItem = {
  workflowId: string
  coreMessage: string
  intent: Intent
  createdAt: string
  postCount: number
  hasScheduledPosts: boolean
  hasPostedPosts: boolean
}
