import { z } from "zod"

const openAIEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
})

export function isOpenAIConfigured(): boolean {
  return openAIEnvSchema.safeParse(process.env).success
}

export function getOpenAIConfig(): { apiKey: string } {
  const parsed = openAIEnvSchema.safeParse(process.env)

  if (!parsed.success) {
    throw new Error("Missing OPENAI_API_KEY")
  }

  return {
    apiKey: parsed.data.OPENAI_API_KEY,
  }
}
