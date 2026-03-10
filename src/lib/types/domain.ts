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
export type PublishJobStatus =
  | "queued"
  | "processing"
  | "retrying"
  | "failed"
  | "published"

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

export type BrandBlueprintPillar = {
  title: string
  description: string
}

export type BrandBlueprint = {
  niche: string
  audience: string
  brandTone: string
  personalityTraits: string[]
  contentPillars: BrandBlueprintPillar[]
  elevatorPitch: string
  bioShort: string
}

export type BrandBlueprintStatus = "draft" | "approved"

export type PersistedBrandBlueprint = {
  id: string
  userId: string
  onboardingPath:
    | "build_personal_brand"
    | "find_what_to_be_known_for"
    | "find_my_niche"
  version: number
  status: BrandBlueprintStatus
  blueprint: BrandBlueprint
  interviewMode: "brand_architect_mode"
  interviewAnswers: string[]
  interviewTranscript: string
  approvedAt: string | null
  createdAt: string
  updatedAt: string
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

export type DraftSimilarityPair = {
  leftPlatform: Platform
  rightPlatform: Platform
  similarityScore: number
  exceedsThreshold: boolean
}

export type DraftQualityFlag = {
  platform: Platform
  code: "low_angle_alignment" | "high_cross_platform_similarity"
  severity: "warning" | "critical"
  message: string
}

export type DraftQualityReport = {
  supervisorPromptVersion: string
  globalDirection: string
  platformAngles: Record<Platform, string>
  similarityThreshold: number
  maxSimilarityScore: number
  similarityPairs: DraftSimilarityPair[]
  diversityAdjustedPlatforms: Platform[]
  flags: DraftQualityFlag[]
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
  publishJob:
    | {
        status: PublishJobStatus
        attemptCount: number
        nextRetryAt: string | null
        lastError: string | null
        updatedAt: string | null
      }
    | null
}
