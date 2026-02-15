import "server-only"

import { generateObject } from "ai"
import { z, type ZodIssue } from "zod"

import { createOpenAIProvider } from "@/lib/ai/provider"
import { agentOutputSchema } from "@/lib/schemas/domain"
import type {
  AgentOutput,
  BrandProfile,
  ContentBrief,
  Platform,
} from "@/lib/types/domain"

const rawAgentModelSchema = z.object({
  platform: z.string().optional(),
  hook: z.string().trim().min(1),
  body: z.string().trim().min(1),
  cta: z.string().trim().min(1),
  hashtags: z.array(z.string().trim().min(1)).default([]),
  visualSuggestion: z.string().trim().min(1),
  status: z.string().optional(),
})

type PlatformRules = {
  platform: Platform
  platformGuidance: string
  maxHookChars: number
  maxBodyChars: number
  maxCtaChars: number
  maxHashtags: number
  totalMaxChars?: number
}

type PlatformAgentInput = {
  brief: ContentBrief
  brandProfile: BrandProfile
}

class AgentOutputValidationError extends Error {
  readonly issues: ZodIssue[]

  constructor(issues: ZodIssue[]) {
    super("Agent output failed Zod validation.")
    this.issues = issues
  }
}

function normalizeHashtags(hashtags: string[]): string[] {
  const normalized = hashtags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .map((tag) => tag.replace(/^#+/, ""))
    .map((tag) => tag.replace(/\s+/g, ""))
    .filter((tag) => tag.length > 0)
    .map((tag) => `#${tag}`)

  return Array.from(new Set(normalized))
}

function getConstrainedOutputSchema(rules: PlatformRules) {
  return agentOutputSchema
    .extend({
      platform: z.literal(rules.platform),
      hook: z.string().trim().min(1).max(rules.maxHookChars),
      body: z.string().trim().min(1).max(rules.maxBodyChars),
      cta: z.string().trim().min(1).max(rules.maxCtaChars),
      hashtags: z
        .array(z.string().regex(/^#[^\s]+$/))
        .max(rules.maxHashtags),
      visualSuggestion: z.string().trim().min(1).max(240),
      status: z.literal("draft"),
    })
    .superRefine((value, context) => {
      if (rules.totalMaxChars === undefined) {
        return
      }

      const totalLength = `${value.hook}\n${value.body}\n${value.cta}`.length
      if (totalLength > rules.totalMaxChars) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Combined hook/body/cta exceeds ${rules.totalMaxChars} chars.`,
          path: ["body"],
        })
      }
    })
}

function buildAgentPrompt(input: PlatformAgentInput, rules: PlatformRules): string {
  return `
Du er en specialiseret ${rules.platform}-agent i DelleRose.ai.
Du må kun omstrukturere inputtet, ikke opfinde fakta.

Platform regler:
${rules.platformGuidance}
- Hook max: ${rules.maxHookChars} tegn
- Body max: ${rules.maxBodyChars} tegn
- CTA max: ${rules.maxCtaChars} tegn
- Hashtags max: ${rules.maxHashtags}
${rules.totalMaxChars ? `- Total (hook+body+cta) max: ${rules.totalMaxChars}` : ""}
- Output status SKAL være "draft"

BrandProfile:
${JSON.stringify(input.brandProfile, null, 2)}

ContentBrief:
${JSON.stringify(input.brief, null, 2)}
`.trim()
}

async function runSingleAgentAttempt(
  input: PlatformAgentInput,
  rules: PlatformRules
): Promise<AgentOutput> {
  const openai = createOpenAIProvider()

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: rawAgentModelSchema,
    temperature: 0.3,
    system: `
Returnér kun struktureret JSON i schemaformat.
Ingen forklaringer, ingen meta-tekst.
Ingen facts må opfindes.
`.trim(),
    prompt: buildAgentPrompt(input, rules),
  })

  const candidate: AgentOutput = {
    platform: rules.platform,
    hook: object.hook,
    body: object.body,
    cta: object.cta,
    hashtags: normalizeHashtags(object.hashtags).slice(0, rules.maxHashtags),
    visualSuggestion: object.visualSuggestion,
    status: "draft",
  }

  const constrainedSchema = getConstrainedOutputSchema(rules)
  const parsed = constrainedSchema.safeParse(candidate)

  if (!parsed.success) {
    throw new AgentOutputValidationError(parsed.error.issues)
  }

  return parsed.data
}

export async function runPlatformAgentWithRetry(
  input: PlatformAgentInput,
  rules: PlatformRules
): Promise<AgentOutput> {
  let latestError: unknown = null

  // MVP rule: retry exactly once on Zod validation failure.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await runSingleAgentAttempt(input, rules)
    } catch (error: unknown) {
      latestError = error
      if (error instanceof AgentOutputValidationError && attempt === 1) {
        continue
      }
      break
    }
  }

  if (latestError instanceof Error) {
    throw latestError
  }

  throw new Error("Platform agent failed unexpectedly.")
}

export type { PlatformAgentInput, PlatformRules }
