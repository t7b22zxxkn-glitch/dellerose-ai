"use server"

import { revalidatePath } from "next/cache"
import type { ZodIssue } from "zod"

import { onboardingFormSchema } from "@/features/onboarding/schema"
import { upsertBrandProfileForCurrentUser } from "@/features/onboarding/service"
import type {
  OnboardingFieldName,
  OnboardingFormState,
} from "@/features/onboarding/types"

const fieldNames: OnboardingFieldName[] = [
  "toneLevel",
  "lengthPreference",
  "opinionLevel",
  "preferredWords",
  "bannedWords",
  "voiceSample",
]

function getStringValue(formData: FormData, key: OnboardingFieldName): string {
  const value = formData.get(key)
  return typeof value === "string" ? value : ""
}

function mapZodIssuesToFieldErrors(
  issues: ZodIssue[]
): Partial<Record<OnboardingFieldName, string>> {
  const fieldErrors: Partial<Record<OnboardingFieldName, string>> = {}

  for (const issue of issues) {
    const [field] = issue.path
    if (typeof field === "string" && fieldNames.includes(field as OnboardingFieldName)) {
      const typedField = field as OnboardingFieldName
      if (!fieldErrors[typedField]) {
        fieldErrors[typedField] = issue.message
      }
    }
  }

  return fieldErrors
}

export async function submitBrandProfileAction(
  _previousState: OnboardingFormState,
  formData: FormData
): Promise<OnboardingFormState> {
  try {
    const parsedInput = onboardingFormSchema.safeParse({
      toneLevel: getStringValue(formData, "toneLevel"),
      lengthPreference: getStringValue(formData, "lengthPreference"),
      opinionLevel: getStringValue(formData, "opinionLevel"),
      preferredWords: getStringValue(formData, "preferredWords"),
      bannedWords: getStringValue(formData, "bannedWords"),
      voiceSample: getStringValue(formData, "voiceSample"),
    })

    if (!parsedInput.success) {
      return {
        status: "error",
        message: "Ret felterne med fejl og prøv igen.",
        fieldErrors: mapZodIssuesToFieldErrors(parsedInput.error.issues),
      }
    }

    const result = await upsertBrandProfileForCurrentUser(parsedInput.data)

    if (!result.success) {
      return {
        status: "error",
        message: result.message,
        fieldErrors: {},
      }
    }

    revalidatePath("/onboarding")

    return {
      status: "success",
      message: "Brand profile gemt.",
      fieldErrors: {},
    }
  } catch {
    return {
      status: "error",
      message: "Uventet fejl under onboarding. Prøv igen.",
      fieldErrors: {},
    }
  }
}
