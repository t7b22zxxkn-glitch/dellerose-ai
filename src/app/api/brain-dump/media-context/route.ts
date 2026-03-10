import { NextResponse } from "next/server"
import type OpenAI from "openai"
import { z } from "zod"

import { isOpenAIConfigured } from "@/lib/openai/config"
import { createOpenAIClient } from "@/lib/openai/server"

const MAX_MEDIA_FILES = 4
const MAX_SINGLE_MEDIA_SIZE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_MEDIA_SIZE_BYTES = 20 * 1024 * 1024

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])
const SUPPORTED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
])

const visionResponseSchema = z.object({
  summary: z.string().trim().min(1),
  angles: z.array(z.string().trim().min(1)).min(1).max(5),
})

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function toHumanFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

async function fileToDataUrl(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString("base64")
  return `data:${file.type};base64,${base64}`
}

function buildVideoContext(videoFiles: File[]): string {
  if (videoFiles.length === 0) {
    return ""
  }

  const listedVideos = videoFiles
    .map((file) => `- ${file.name} (${toHumanFileSize(file.size)})`)
    .join("\n")

  return `
Videofiler vedhæftet (kræver manuel tolkning lige nu):
${listedVideos}

Anbefaling: Brug din voice-over i Brain Dump til at beskrive scener, tempo, budskab og CTA.
`.trim()
}

async function generateImageInsights(imageFiles: File[]): Promise<z.infer<typeof visionResponseSchema> | null> {
  if (imageFiles.length === 0 || !isOpenAIConfigured()) {
    return null
  }

  const openai = createOpenAIClient()
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `
Analyser billederne og returner KUN valid JSON med formen:
{
  "summary": "kort dansk opsummering af visuel kontekst",
  "angles": ["kreativ vinkel 1", "kreativ vinkel 2"]
}

Regler:
- Vær konkret og handlingsorienteret.
- Hold dig til det man kan udlede af billederne.
- Foreslå vinkler der kan bruges på tværs af LinkedIn, Instagram, TikTok, Facebook og X.
`.trim(),
    },
  ]

  for (const imageFile of imageFiles) {
    const dataUrl = await fileToDataUrl(imageFile)
    userContent.push({
      type: "image_url",
      image_url: {
        url: dataUrl,
        detail: "low",
      },
    })
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Du er en kreativ social media supervisor. Returner kun JSON uden ekstra tekst.",
      },
      {
        role: "user",
        content: userContent,
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) {
    return null
  }

  const parsedJson = (() => {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return null
    }
  })()

  if (!parsedJson) {
    return null
  }

  const parsed = visionResponseSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return null
  }

  return parsed.data
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const mediaEntries = formData.getAll("media")
    const files = mediaEntries.filter((entry): entry is File => entry instanceof File)

    if (files.length === 0) {
      return badRequest("Ingen mediefiler modtaget.")
    }

    if (files.length > MAX_MEDIA_FILES) {
      return badRequest(`Du kan maks vedhæfte ${MAX_MEDIA_FILES} filer ad gangen.`)
    }

    let totalBytes = 0
    for (const file of files) {
      if (file.size <= 0) {
        return badRequest(`Filen "${file.name}" er tom.`)
      }

      if (file.size > MAX_SINGLE_MEDIA_SIZE_BYTES) {
        return badRequest(
          `Filen "${file.name}" er for stor. Maks størrelse pr. fil er ${toHumanFileSize(MAX_SINGLE_MEDIA_SIZE_BYTES)}.`
        )
      }

      totalBytes += file.size
    }

    if (totalBytes > MAX_TOTAL_MEDIA_SIZE_BYTES) {
      return badRequest(
        `Samlet filstørrelse er for stor. Maks er ${toHumanFileSize(MAX_TOTAL_MEDIA_SIZE_BYTES)}.`
      )
    }

    const imageFiles = files.filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type))
    const videoFiles = files.filter((file) => SUPPORTED_VIDEO_TYPES.has(file.type))
    const unsupportedFiles = files.filter(
      (file) => !SUPPORTED_IMAGE_TYPES.has(file.type) && !SUPPORTED_VIDEO_TYPES.has(file.type)
    )

    if (unsupportedFiles.length > 0) {
      return badRequest(
        `Filtype ikke understøttet: ${unsupportedFiles.map((file) => file.name).join(", ")}.`
      )
    }

    const imageInsights = await generateImageInsights(imageFiles)
    const sections: string[] = []

    if (imageInsights) {
      sections.push(`Billedkontekst: ${imageInsights.summary}`)
      sections.push(
        `Kreative vinkler:\n${imageInsights.angles.map((angle) => `- ${angle}`).join("\n")}`
      )
    } else if (imageFiles.length > 0) {
      sections.push(
        "Billedfiler er vedhæftet, men automatisk analyse kunne ikke udføres. Brug voice-over til at beskrive motiv og vinkel."
      )
    }

    if (videoFiles.length > 0) {
      sections.push(buildVideoContext(videoFiles))
    }

    const mediaContext = sections.join("\n\n").trim()
    if (!mediaContext) {
      return badRequest("Kunne ikke udlede media-kontekst.")
    }

    return NextResponse.json({
      mediaContext,
      imageCount: imageFiles.length,
      videoCount: videoFiles.length,
    })
  } catch {
    return NextResponse.json(
      {
        error: "Media-analyse fejlede. Prøv igen om et øjeblik.",
      },
      { status: 500 }
    )
  }
}
