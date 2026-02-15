import "server-only"

import OpenAI from "openai"

import { getOpenAIConfig } from "@/lib/openai/config"

export function createOpenAIClient(): OpenAI {
  const { apiKey } = getOpenAIConfig()
  return new OpenAI({ apiKey })
}
