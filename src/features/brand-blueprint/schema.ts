import { z } from "zod"

import { brandBlueprintSchema } from "@/lib/schemas/domain"

export const brandBlueprintInterviewQuestionSchema = z.object({
  id: z.enum(["q1", "q2", "q3"]),
  question: z.string().trim().min(1),
  answerTranscript: z.string().trim().min(1),
})

export const brandBlueprintInterviewInputSchema = z.object({
  path: z.enum([
    "build_personal_brand",
    "find_what_to_be_known_for",
    "find_my_niche",
  ]),
  answers: z.array(brandBlueprintInterviewQuestionSchema).length(3),
})

export const brandBlueprintAnalysisInputSchema = z.object({
  path: brandBlueprintInterviewInputSchema.shape.path,
  answers: z.array(z.string().trim().min(1)).length(3),
  interviewTranscript: z.string().trim().min(1),
})

export const approveBrandBlueprintInputSchema = z.object({
  blueprintId: z.string().uuid(),
})

export const saveManualBrandBlueprintInputSchema = z.object({
  path: brandBlueprintInterviewInputSchema.shape.path,
  blueprint: brandBlueprintSchema,
  interviewAnswers: z.array(z.string().trim().min(1)).length(3),
  interviewTranscript: z.string().trim().min(1),
})
