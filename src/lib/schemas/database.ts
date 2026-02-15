import { z } from "zod"

import { brandProfileSchema } from "@/lib/schemas/domain"
import type { BrandProfile } from "@/lib/types/domain"

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
