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
})
