import "server-only"

import type { AgentOutput } from "@/lib/types/domain"

import { runPlatformAgentWithRetry, type PlatformAgentInput } from "./shared"

export async function generateLinkedInAgentOutput(
  input: PlatformAgentInput
): Promise<AgentOutput> {
  return runPlatformAgentWithRetry(input, {
    platform: "linkedin",
    platformGuidance:
      "Professionel men menneskelig tone. Fokus på indsigt, troværdighed og klar struktur.",
    maxHookChars: 180,
    maxBodyChars: 2200,
    maxCtaChars: 180,
    maxHashtags: 5,
  })
}
