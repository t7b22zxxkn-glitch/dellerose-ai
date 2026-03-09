import type { Platform, PublishJobStatus } from "@/lib/types/domain"

export type SchedulerOpsJobItem = {
  id: string
  workflowId: string
  platform: Platform
  status: PublishJobStatus
  attemptCount: number
  maxAttempts: number
  nextRetryAt: string | null
  lastError: string | null
  deadLetteredAt: string | null
  updatedAt: string
}

export type SchedulerOpsSnapshot = {
  totalJobs: number
  statusCounts: Record<PublishJobStatus, number>
  attentionJobs: SchedulerOpsJobItem[]
}
