export type Intent =
  | "sales"
  | "storytelling"
  | "educational"
  | "debate"
  | "update"

export type Platform =
  | "linkedin"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "twitter"

export type PostStatus = "draft" | "approved" | "scheduled" | "posted"
export type PlanStatus = "pending" | "scheduled" | "posted"

export type BrandProfile = {
  id: string
  userId: string
  toneLevel: number
  lengthPreference: number
  opinionLevel: number
  preferredWords: string[]
  bannedWords: string[]
  voiceSample?: string
}

export type ContentBrief = {
  coreMessage: string
  intent: Intent
  targetAudience: string
  keyPoints: string[]
  emotionalTone: string
}

export type AgentOutput = {
  platform: Platform
  hook: string
  body: string
  cta: string
  hashtags: string[]
  visualSuggestion: string
  status: PostStatus
}

export type PostPlan = {
  id: string
  platform: Platform
  hook: string
  body: string
  cta: string
  hashtags: string[]
  visualSuggestion: string
  status: PlanStatus
  scheduledFor: string | null
}
