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

export const mediaContextResponseSchema = z.object({
  mediaContext: z.string().trim().min(1),
  imageCount: z.number().int().min(0),
  videoCount: z.number().int().min(0),
})
