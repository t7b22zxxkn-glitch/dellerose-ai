const baseUrl = process.env.BRAIN_DUMP_SMOKE_BASE_URL
const smokeKey = process.env.BRAIN_DUMP_SMOKE_KEY

if (!baseUrl) {
  console.error(
    "Missing BRAIN_DUMP_SMOKE_BASE_URL. Example: https://your-preview-url.vercel.app"
  )
  process.exit(1)
}

const transcript =
  process.env.BRAIN_DUMP_SMOKE_TRANSCRIPT ??
  "Vi lancerer et nyt workflow i dag med fokus på kvalitet og konsistens."

async function run() {
  const response = await fetch(`${baseUrl}/api/brain-dump/smoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(smokeKey ? { "x-smoke-key": smokeKey } : {}),
    },
    body: JSON.stringify({ transcript }),
  })

  const payload = (await response.json()) as {
    ok?: boolean
    error?: string
    brief?: {
      coreMessage: string
      targetAudience: string
      keyPoints: string[]
    }
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Brain Dump smoke route failed.")
  }

  if (
    !payload.brief?.coreMessage ||
    !payload.brief?.targetAudience ||
    !payload.brief?.keyPoints ||
    payload.brief.keyPoints.length === 0
  ) {
    throw new Error("Brief payload is incomplete.")
  }

  console.log("Brain Dump remote smoke test passed.")
  console.log(JSON.stringify(payload, null, 2))
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error"
  console.error(`Brain Dump smoke test failed: ${message}`)
  process.exit(1)
})
