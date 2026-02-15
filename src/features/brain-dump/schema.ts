import { z } from "zod"

import { contentBriefSchema } from "@/lib/schemas/domain"

export const transcribeResponseSchema = z.object({
  transcript: z.string().trim().min(1),
})

export const analyzeRequestSchema = z.object({
  transcript: z.string().trim().min(1),
})

export const analyzeResponseSchema = z.object({
  brief: contentBriefSchema,
})
