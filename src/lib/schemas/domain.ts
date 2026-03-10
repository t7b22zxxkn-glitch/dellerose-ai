import { z } from "zod"

export const intentSchema = z.enum([
  "sales",
  "storytelling",
  "educational",
  "debate",
  "update",
])

export const platformSchema = z.enum([
  "linkedin",
  "tiktok",
  "instagram",
  "facebook",
  "twitter",
])

export const postStatusSchema = z.enum([
  "draft",
  "approved",
  "scheduled",
  "posted",
])

export const planStatusSchema = z.enum(["pending", "scheduled", "posted"])
export const publishJobStatusSchema = z.enum([
  "queued",
  "processing",
  "retrying",
  "failed",
  "published",
])

export const brandProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  toneLevel: z.number().int().min(1).max(10),
  lengthPreference: z.number().int().min(1).max(5),
  opinionLevel: z.number().int().min(1).max(10),
  preferredWords: z.array(z.string()),
  bannedWords: z.array(z.string()),
  voiceSample: z.string().url().optional(),
})

export const brandBlueprintPillarSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(220),
})

export const brandBlueprintSchema = z.object({
  niche: z.string().trim().min(1).max(180),
  audience: z.string().trim().min(1).max(180),
  brandTone: z.string().trim().min(1).max(140),
  personalityTraits: z.array(z.string().trim().min(1).max(40)).min(3).max(5),
  contentPillars: z.array(brandBlueprintPillarSchema).length(3),
  elevatorPitch: z.string().trim().min(1).max(420),
  bioShort: z.string().trim().min(1).max(220),
})

export const brandBlueprintStatusSchema = z.enum(["draft", "approved"])

export const persistedBrandBlueprintSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  onboardingPath: z.enum([
    "build_personal_brand",
    "find_what_to_be_known_for",
    "find_my_niche",
  ]),
  version: z.number().int().min(1),
  status: brandBlueprintStatusSchema,
  blueprint: brandBlueprintSchema,
  interviewMode: z.literal("brand_architect_mode"),
  interviewAnswers: z.array(z.string().trim().min(1)).length(3),
  interviewTranscript: z.string().trim().min(1),
  approvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const contentBriefSchema = z.object({
  coreMessage: z.string().min(1),
  intent: intentSchema,
  targetAudience: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
  emotionalTone: z.string().min(1),
})

export const agentOutputSchema = z.object({
  platform: platformSchema,
  hook: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
  hashtags: z.array(z.string()),
  visualSuggestion: z.string().min(1),
  status: postStatusSchema,
})

export const draftSimilarityPairSchema = z.object({
  leftPlatform: platformSchema,
  rightPlatform: platformSchema,
  similarityScore: z.number().min(0).max(1),
  exceedsThreshold: z.boolean(),
})

export const draftQualityFlagSchema = z.object({
  platform: platformSchema,
  code: z.enum(["low_angle_alignment", "high_cross_platform_similarity"]),
  severity: z.enum(["warning", "critical"]),
  message: z.string().min(1),
})

export const draftQualityReportSchema = z.object({
  supervisorPromptVersion: z.string().min(1),
  globalDirection: z.string().min(1),
  platformAngles: z.object({
    linkedin: z.string().min(1),
    tiktok: z.string().min(1),
    instagram: z.string().min(1),
    facebook: z.string().min(1),
    twitter: z.string().min(1),
  }),
  similarityThreshold: z.number().min(0).max(1),
  maxSimilarityScore: z.number().min(0).max(1),
  similarityPairs: z.array(draftSimilarityPairSchema),
  diversityAdjustedPlatforms: z.array(platformSchema),
  flags: z.array(draftQualityFlagSchema),
})

export const publishJobSnapshotSchema = z.object({
  status: publishJobStatusSchema,
  attemptCount: z.number().int().min(0),
  nextRetryAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const postPlanSchema = z.object({
  id: z.string().min(1),
  platform: platformSchema,
  hook: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
  hashtags: z.array(z.string()),
  visualSuggestion: z.string().min(1),
  status: planStatusSchema,
  scheduledFor: z.string().datetime().nullable(),
  publishJob: publishJobSnapshotSchema.nullable(),
})
