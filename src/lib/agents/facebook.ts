import "server-only"

import type { AgentOutput } from "@/lib/types/domain"

import { runPlatformAgentWithRetry, type PlatformAgentInput } from "./shared"

export async function generateFacebookAgentOutput(
  input: PlatformAgentInput
): Promise<AgentOutput> {
  return runPlatformAgentWithRetry(input, {
    platform: "facebook",
    platformGuidance:
      "Samtalebåret tone med tydelig pointe. God balance mellem storytelling og CTA.",
    maxHookChars: 180,
    maxBodyChars: 2400,
    maxCtaChars: 180,
    maxHashtags: 6,
  })
}
