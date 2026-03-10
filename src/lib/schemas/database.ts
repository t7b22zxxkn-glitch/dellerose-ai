import { z } from "zod"

import {
  brandBlueprintSchema,
  brandBlueprintStatusSchema,
  brandProfileSchema,
} from "@/lib/schemas/domain"
import type { BrandProfile, PersistedBrandBlueprint } from "@/lib/types/domain"

export const profileRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  tone_level: z.number().int().min(1).max(10),
  length_preference: z.number().int().min(1).max(5),
  opinion_level: z.number().int().min(1).max(10),
  preferred_words: z.array(z.string()),
  banned_words: z.array(z.string()),
  voice_sample: z.string().url().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export type ProfileRow = z.infer<typeof profileRowSchema>

export function mapProfileRowToBrandProfile(row: ProfileRow): BrandProfile {
  return brandProfileSchema.parse({
    id: row.id,
    userId: row.user_id,
    toneLevel: row.tone_level,
    lengthPreference: row.length_preference,
    opinionLevel: row.opinion_level,
    preferredWords: row.preferred_words,
    bannedWords: row.banned_words,
    voiceSample: row.voice_sample ?? undefined,
  })
}

export const brandBlueprintRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  onboarding_path: z.enum([
    "build_personal_brand",
    "find_what_to_be_known_for",
    "find_my_niche",
  ]),
  version: z.number().int().min(1),
  status: brandBlueprintStatusSchema,
  niche: z.string(),
  audience: z.string(),
  brand_tone: z.string(),
  personality_traits: z.array(z.string()),
  content_pillars: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    })
  ),
  elevator_pitch: z.string(),
  bio_short: z.string(),
  interview_mode: z.literal("brand_architect_mode"),
  interview_answers: z.array(z.string()).length(3),
  interview_transcript: z.string(),
  approved_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type BrandBlueprintRow = z.infer<typeof brandBlueprintRowSchema>

export function mapBrandBlueprintRowToDomain(
  row: BrandBlueprintRow
): PersistedBrandBlueprint {
  const blueprint = brandBlueprintSchema.parse({
    niche: row.niche,
    audience: row.audience,
    brandTone: row.brand_tone,
    personalityTraits: row.personality_traits,
    contentPillars: row.content_pillars,
    elevatorPitch: row.elevator_pitch,
    bioShort: row.bio_short,
  })

  return {
    id: row.id,
    userId: row.user_id,
    onboardingPath: row.onboarding_path,
    version: row.version,
    status: row.status,
    blueprint,
    interviewMode: row.interview_mode,
    interviewAnswers: row.interview_answers,
    interviewTranscript: row.interview_transcript,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
