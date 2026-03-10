import "server-only"

import {
  brandBlueprintRowSchema,
  mapBrandBlueprintRowToDomain,
} from "@/lib/schemas/database"
import { resolveCurrentUserId } from "@/lib/supabase/auth"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { BrandBlueprint, PersistedBrandBlueprint } from "@/lib/types/domain"

import type { BrandBlueprintBootstrap } from "./types"

export async function getActiveBrandBlueprintForCurrentUser(): Promise<PersistedBrandBlueprint | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  try {
    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)

    if (!userId) {
      return null
    }

    const { data, error } = await supabase
      .from("brand_blueprints")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    const parsed = brandBlueprintRowSchema.safeParse(data)
    if (!parsed.success) {
      return null
    }

    return mapBrandBlueprintRowToDomain(parsed.data)
  } catch {
    return null
  }
}

export async function getBrandBlueprintBootstrapForCurrentUser(): Promise<BrandBlueprintBootstrap> {
  if (!isSupabaseConfigured()) {
    return {
      activeBlueprint: null,
      notice:
        "Supabase er ikke konfigureret endnu. Brand Blueprint onboarding kræver databaseforbindelse.",
    }
  }

  const blueprint = await getActiveBrandBlueprintForCurrentUser()
  if (!blueprint) {
    return {
      activeBlueprint: null,
      notice: null,
    }
  }

  return {
    activeBlueprint: blueprint,
    notice: null,
  }
}

export async function upsertBrandBlueprintDraftForCurrentUser(input: {
  path: "build_personal_brand" | "find_what_to_be_known_for" | "find_my_niche"
  blueprint: BrandBlueprint
  interviewAnswers: string[]
  interviewTranscript: string
}): Promise<
  | {
      success: true
      blueprint: PersistedBrandBlueprint
    }
  | {
      success: false
      message: string
    }
> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message:
        "Supabase mangler konfiguration. Sæt miljøvariablerne før du gemmer Brand Blueprint.",
    }
  }

  try {
    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)

    if (!userId) {
      return {
        success: false,
        message: "Du skal være logget ind for at gemme Brand Blueprint.",
      }
    }

    const { data: existingRow } = await supabase
      .from("brand_blueprints")
      .select("version")
      .eq("user_id", userId)
      .maybeSingle()

    const nextVersion =
      typeof existingRow?.version === "number" && existingRow.version >= 1
        ? existingRow.version + 1
        : 1

    const { data, error } = await supabase
      .from("brand_blueprints")
      .upsert(
        {
          user_id: userId,
          onboarding_path: input.path,
          version: nextVersion,
          status: "draft",
          niche: input.blueprint.niche,
          audience: input.blueprint.audience,
          brand_tone: input.blueprint.brandTone,
          personality_traits: input.blueprint.personalityTraits,
          content_pillars: input.blueprint.contentPillars,
          elevator_pitch: input.blueprint.elevatorPitch,
          bio_short: input.blueprint.bioShort,
          interview_mode: "brand_architect_mode",
          interview_answers: input.interviewAnswers,
          interview_transcript: input.interviewTranscript,
          approved_at: null,
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single()

    if (error || !data) {
      return {
        success: false,
        message: "Kunne ikke gemme Brand Blueprint i databasen.",
      }
    }

    const parsed = brandBlueprintRowSchema.safeParse(data)
    if (!parsed.success) {
      return {
        success: false,
        message:
          "Brand Blueprint blev gemt, men svaret kunne ikke valideres. Prøv at opdatere siden.",
      }
    }

    return {
      success: true,
      blueprint: mapBrandBlueprintRowToDomain(parsed.data),
    }
  } catch {
    return {
      success: false,
      message: "Uventet fejl under gemning af Brand Blueprint.",
    }
  }
}

export async function approveBrandBlueprintForCurrentUser(
  blueprintId: string
): Promise<
  | {
      success: true
      blueprint: PersistedBrandBlueprint
    }
  | {
      success: false
      message: string
    }
> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message:
        "Supabase mangler konfiguration. Sæt miljøvariablerne før godkendelse.",
    }
  }

  try {
    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)
    if (!userId) {
      return {
        success: false,
        message: "Du skal være logget ind for at godkende Brand Blueprint.",
      }
    }

    const { data, error } = await supabase
      .from("brand_blueprints")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", blueprintId)
      .eq("user_id", userId)
      .select("*")
      .single()

    if (error || !data) {
      return {
        success: false,
        message: "Kunne ikke godkende Brand Blueprint.",
      }
    }

    const parsed = brandBlueprintRowSchema.safeParse(data)
    if (!parsed.success) {
      return {
        success: false,
        message:
          "Brand Blueprint blev godkendt, men svaret kunne ikke valideres korrekt.",
      }
    }

    return {
      success: true,
      blueprint: mapBrandBlueprintRowToDomain(parsed.data),
    }
  } catch {
    return {
      success: false,
      message: "Uventet fejl under godkendelse af Brand Blueprint.",
    }
  }
}
