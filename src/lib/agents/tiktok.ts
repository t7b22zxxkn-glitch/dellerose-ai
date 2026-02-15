import "server-only"

import type { AgentOutput } from "@/lib/types/domain"

import { runPlatformAgentWithRetry, type PlatformAgentInput } from "./shared"

export async function generateTikTokAgentOutput(
  input: PlatformAgentInput
): Promise<AgentOutput> {
  return runPlatformAgentWithRetry(input, {
    platform: "tiktok",
    platformGuidance:
      "Kort, energisk og mundret tekst. Fokus på hook og tydelig handling.",
    maxHookChars: 100,
    maxBodyChars: 500,
    maxCtaChars: 120,
    maxHashtags: 8,
  })
}
