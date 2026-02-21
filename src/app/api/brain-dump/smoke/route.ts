import { NextResponse } from "next/server"
import { z } from "zod"

import { generateContentBriefFromTranscript } from "@/lib/agents/master"
import { isOpenAIConfigured } from "@/lib/openai/config"

const smokeInputSchema = z.object({
  transcript: z.string().trim().min(1),
})

function isAuthorized(request: Request): boolean {
  const smokeKey = process.env.BRAIN_DUMP_SMOKE_KEY
  if (!smokeKey) {
    return process.env.NODE_ENV !== "production"
  }

  const providedKey = request.headers.get("x-smoke-key")
  return providedKey === smokeKey
}

export async function POST(request: Request) {
  try {
    if (!isOpenAIConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "OPENAI_API_KEY mangler. Sæt den i miljøvariabler før Brain Dump smoke test.",
        },
        { status: 500 }
      )
    }

    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized smoke test request.",
        },
        { status: 401 }
      )
    }

    const body = (await request.json()) as unknown
    const parsedInput = smokeInputSchema.safeParse(body)

    if (!parsedInput.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Transcript mangler til smoke test.",
        },
        { status: 400 }
      )
    }

    const brief = await generateContentBriefFromTranscript(parsedInput.data.transcript)

    return NextResponse.json({
      ok: true,
      brief,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Smoke test fejlede under kald til Master Agent.",
      },
      { status: 500 }
    )
  }
}
