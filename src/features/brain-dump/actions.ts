"use server"

import type { ContentBrief } from "@/lib/types/domain"

import { analyzeRequestSchema } from "@/features/brain-dump/schema"
import { generateContentBriefFromTranscript } from "@/lib/agents/master"
import { isOpenAIConfigured } from "@/lib/openai/config"

type AnalyzeTranscriptActionResult =
  | {
      success: true
      brief: ContentBrief
    }
  | {
      success: false
      message: string
    }

export async function analyzeTranscriptAction(
  transcript: string
): Promise<AnalyzeTranscriptActionResult> {
  try {
    if (!isOpenAIConfigured()) {
      return {
        success: false,
        message:
          "OPENAI_API_KEY mangler. Tilføj nøglen i miljøvariabler før analyse.",
      }
    }

    const input = analyzeRequestSchema.safeParse({ transcript })

    if (!input.success) {
      return {
        success: false,
        message: "Transcript mangler eller er ugyldigt.",
      }
    }

    const brief = await generateContentBriefFromTranscript(input.data.transcript)

    return {
      success: true,
      brief,
    }
  } catch {
    return {
      success: false,
      message: "Analyse fejlede. Prøv igen om et øjeblik.",
    }
  }
}
