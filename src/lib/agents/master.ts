import "server-only"

import { generateObject } from "ai"

import { contentBriefSchema } from "@/lib/schemas/domain"
import type { ContentBrief } from "@/lib/types/domain"

import { createOpenAIProvider } from "@/lib/ai/provider"

const SYSTEM_PROMPT = `
Du er Master Agent i DelleRose.ai.
Din opgave er kun at strukturere brugerens transcript til et ContentBrief JSON objekt.

Regler:
- Opfind aldrig fakta, personer eller data som ikke findes i transcriptet.
- Bevar brugerens intention og kernebudskab.
- Hvis noget er uklart, lav en konservativ formulering baseret på transcriptets ordlyd.
- Svar SKAL passe til det givne schema.
`.trim()

function buildMockBriefFromTranscript(transcript: string): ContentBrief {
  const normalizedTranscript = transcript.replace(/\s+/g, " ").trim()
  const firstSentence = normalizedTranscript.split(/[.!?]/).find(Boolean)?.trim()
  const coreMessage = firstSentence && firstSentence.length > 0
    ? firstSentence
    : normalizedTranscript.slice(0, 180)

  return contentBriefSchema.parse({
    coreMessage: coreMessage || "Ingen kernebesked udledt.",
    intent: "update",
    targetAudience: "Eksisterende følgere",
    keyPoints: [coreMessage || normalizedTranscript || "Ingen input modtaget."],
    emotionalTone: "neutral",
  })
}

export async function generateContentBriefFromTranscript(
  transcript: string
): Promise<ContentBrief> {
  const cleanTranscript = transcript.trim()

  if (!cleanTranscript) {
    throw new Error("Transcript er tomt.")
  }

  if (process.env.BRAIN_DUMP_MOCK_BRIEF === "true") {
    return buildMockBriefFromTranscript(cleanTranscript)
  }

  const openai = createOpenAIProvider()

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: contentBriefSchema,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    prompt: `
Konverter nedenstående rå transcript til ContentBrief.
Undlad antagelser ud over transcriptet.

Transcript:
${cleanTranscript}
`.trim(),
  })

  return object
}
