import { z } from "zod"

function parseCommaSeparatedWords(value: string): string[] {
  const words = value
    .split(",")
    .map((word) => word.trim())
    .filter((word) => word.length > 0)

  return Array.from(new Set(words))
}

const optionalUrlFieldSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || z.string().url().safeParse(value).success,
    "Voice sample skal være en gyldig URL."
  )
  .transform((value) => (value.length === 0 ? undefined : value))

export const onboardingFormSchema = z.object({
  toneLevel: z.coerce.number().int().min(1).max(10),
  lengthPreference: z.coerce.number().int().min(1).max(5),
  opinionLevel: z.coerce.number().int().min(1).max(10),
  preferredWords: z.string().transform(parseCommaSeparatedWords),
  bannedWords: z.string().transform(parseCommaSeparatedWords),
  voiceSample: optionalUrlFieldSchema,
})

export type OnboardingFormInput = z.infer<typeof onboardingFormSchema>
