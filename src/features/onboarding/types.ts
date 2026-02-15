export type OnboardingFieldName =
  | "toneLevel"
  | "lengthPreference"
  | "opinionLevel"
  | "preferredWords"
  | "bannedWords"
  | "voiceSample"

export type OnboardingFormState = {
  status: "idle" | "success" | "error"
  message: string
  fieldErrors: Partial<Record<OnboardingFieldName, string>>
}

export const onboardingInitialState: OnboardingFormState = {
  status: "idle",
  message: "",
  fieldErrors: {},
}
