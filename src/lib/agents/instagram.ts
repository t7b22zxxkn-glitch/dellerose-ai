import "server-only"

import type { AgentOutput } from "@/lib/types/domain"

import { runPlatformAgentWithRetry, type PlatformAgentInput } from "./shared"

export async function generateInstagramAgentOutput(
  input: PlatformAgentInput
): Promise<AgentOutput> {
  return runPlatformAgentWithRetry(input, {
    platform: "instagram",
    platformGuidance:
      "Visuelt og relaterbart. Tydelig fortælling i caption uden at opfinde nye fakta.",
    maxHookChars: 150,
    maxBodyChars: 2000,
    maxCtaChars: 140,
    maxHashtags: 12,
  })
}
