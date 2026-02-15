import {
  transcribeResponseSchema,
} from "@/features/brain-dump/schema"

type ApiErrorPayload = {
  error?: string
}

async function parseApiError(response: Response): Promise<string> {
  const fallbackMessage = "Noget gik galt. Prøv igen."

  try {
    const payload = (await response.json()) as ApiErrorPayload
    return payload.error ?? fallbackMessage
  } catch {
    return fallbackMessage
  }
}

export async function transcribeAudioBlob(audioBlob: Blob): Promise<string> {
  const formData = new FormData()
  const file = new File([audioBlob], "brain-dump.webm", {
    type: audioBlob.type || "audio/webm",
  })

  formData.append("audio", file)

  const response = await fetch("/api/brain-dump/transcribe", {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const payload = (await response.json()) as unknown
  const parsed = transcribeResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error("Transskript kunne ikke valideres.")
  }

  return parsed.data.transcript
}
