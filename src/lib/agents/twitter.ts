import "server-only"

import type { AgentOutput } from "@/lib/types/domain"

import { runPlatformAgentWithRetry, type PlatformAgentInput } from "./shared"

export async function generateTwitterAgentOutput(
  input: PlatformAgentInput
): Promise<AgentOutput> {
  return runPlatformAgentWithRetry(input, {
    platform: "twitter",
    platformGuidance:
      "Kort, skarpt og debatsikkert uden at opfinde fakta. Hold sproget punchy.",
    maxHookChars: 80,
    maxBodyChars: 160,
    maxCtaChars: 60,
    maxHashtags: 4,
    totalMaxChars: 280,
  })
}
