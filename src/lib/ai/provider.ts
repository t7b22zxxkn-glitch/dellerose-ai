import "server-only"

import { createOpenAI } from "@ai-sdk/openai"

import { getOpenAIConfig } from "@/lib/openai/config"

export function createOpenAIProvider() {
  const { apiKey } = getOpenAIConfig()
  return createOpenAI({ apiKey })
}
