import type { AgentOutput, ContentBrief, PostPlan } from "@/lib/types/domain"

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
  postPlans: PostPlan[]
  chatLog: WorkflowChatItem[]
}

export type PersistedWorkflowSnapshot = {
  workflowId: string
  transcript: string
  brief: ContentBrief
  drafts: AgentOutput[]
  postPlans: PostPlan[]
  chatLog: WorkflowChatItem[]
}
