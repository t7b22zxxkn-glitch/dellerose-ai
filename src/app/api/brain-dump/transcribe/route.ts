import { NextResponse } from "next/server"

import { transcribeResponseSchema } from "@/features/brain-dump/schema"
import { isOpenAIConfigured } from "@/lib/openai/config"
import { createOpenAIClient } from "@/lib/openai/server"

const MAX_AUDIO_FILE_SIZE_BYTES = 25 * 1024 * 1024

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(request: Request) {
  try {
    if (!isOpenAIConfigured()) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY mangler. Tilføj nøglen i miljøvariabler før transskription.",
        },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const audio = formData.get("audio")

    if (!(audio instanceof File)) {
      return badRequest("Ingen lydfil modtaget.")
    }

    if (audio.size === 0) {
      return badRequest("Lydfilen er tom.")
    }

    if (audio.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      return badRequest("Lydfilen er for stor. Maks størrelse er 25 MB.")
    }

    const openai = createOpenAIClient()
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audio,
      language: "da",
    })

    const output = transcribeResponseSchema.safeParse({
      transcript: transcription.text,
    })

    if (!output.success) {
      return NextResponse.json(
        { error: "Whisper returnerede et ugyldigt svar." },
        { status: 502 }
      )
    }

    return NextResponse.json(output.data)
  } catch {
    return NextResponse.json(
      { error: "Transskription fejlede. Prøv igen om et øjeblik." },
      { status: 500 }
    )
  }
}
