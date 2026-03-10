import type { BrandBlueprint, PersistedBrandBlueprint } from "@/lib/types/domain"

export type BrandBlueprintPath =
  | "build_personal_brand"
  | "find_what_to_be_known_for"
  | "find_my_niche"

export type BrandBlueprintInterviewAnswer = {
  id: "q1" | "q2" | "q3"
  question: string
  answerTranscript: string
}

export type BrandBlueprintDraft = {
  path: BrandBlueprintPath
  answers: BrandBlueprintInterviewAnswer[]
  interviewTranscript: string
  blueprint: BrandBlueprint
  promptVersion: string
}

export type BrandBlueprintBootstrap = {
  activeBlueprint: PersistedBrandBlueprint | null
  notice: string | null
}
