import { POST as transcribeRoute } from "../src/app/api/brain-dump/transcribe/route"
import { analyzeTranscriptAction } from "../src/features/brain-dump/actions"

const mockTranscript =
  process.env.BRAIN_DUMP_SMOKE_TRANSCRIPT ??
  "Vi lancerer et nyt workflow i dag med fokus på kvalitet og konsistens."

async function run() {
  process.env.BRAIN_DUMP_MOCK_TRANSCRIPT = mockTranscript
  process.env.BRAIN_DUMP_MOCK_BRIEF = "true"
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "smoke-test-key"

  const fakeAudioPayload = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0])
  const formData = new FormData()
  formData.append(
    "audio",
    new File([fakeAudioPayload], "smoke-test.webm", {
      type: "audio/webm",
    })
  )

  const transcribeResponse = await transcribeRoute(
    new Request("http://localhost/api/brain-dump/transcribe", {
      method: "POST",
      body: formData,
    })
  )

  if (!transcribeResponse.ok) {
    const payload = await transcribeResponse.json()
    throw new Error(`Transcribe route failed: ${JSON.stringify(payload)}`)
  }

  const transcriptionPayload = (await transcribeResponse.json()) as {
    transcript?: string
  }

  if (!transcriptionPayload.transcript) {
    throw new Error("Transcribe route returned empty transcript.")
  }

  const analyzeResult = await analyzeTranscriptAction(transcriptionPayload.transcript)
  if (!analyzeResult.success) {
    throw new Error(analyzeResult.message)
  }

  if (
    !analyzeResult.brief.coreMessage ||
    !analyzeResult.brief.targetAudience ||
    analyzeResult.brief.keyPoints.length === 0
  ) {
    throw new Error("Brief payload is incomplete.")
  }

  console.log("Brain Dump local smoke test passed.")
  console.log(
    JSON.stringify(
      {
        transcript: transcriptionPayload.transcript,
        brief: analyzeResult.brief,
      },
      null,
      2
    )
  )
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error"
  console.error(`Brain Dump smoke test failed: ${message}`)
  process.exit(1)
})
