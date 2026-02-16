import "server-only"

import {
  mapProfileRowToBrandProfile,
  profileRowSchema,
} from "@/lib/schemas/database"
import { resolveCurrentUserId } from "@/lib/supabase/auth"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { BrandProfile } from "@/lib/types/domain"

import type { OnboardingFormInput } from "./schema"

export type OnboardingBootstrap = {
  profile: BrandProfile | null
  canSubmit: boolean
  notice: string | null
}

type UpsertBrandProfileResult =
  | {
      success: true
      profile: BrandProfile
    }
  | {
      success: false
      message: string
    }

export async function getOnboardingBootstrap(): Promise<OnboardingBootstrap> {
  if (!isSupabaseConfigured()) {
    return {
      profile: null,
      canSubmit: false,
      notice:
        "Supabase mangler konfiguration. Tilføj NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    }
  }

  try {
    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)

    if (!userId) {
      return {
        profile: null,
        canSubmit: false,
        notice:
          "Du skal være logget ind i Supabase Auth (eller sætte DELLEROSE_DEV_USER_ID lokalt) for at gemme en brand profile.",
      }
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (error) {
      return {
        profile: null,
        canSubmit: true,
        notice:
          "Kunne ikke hente eksisterende brand profile endnu. Du kan stadig udfylde og gemme en ny.",
      }
    }

    if (!data) {
      return {
        profile: null,
        canSubmit: true,
        notice: null,
      }
    }

    const parsedRow = profileRowSchema.safeParse(data)

    if (!parsedRow.success) {
      return {
        profile: null,
        canSubmit: true,
        notice:
          "Eksisterende profile-data kunne ikke valideres. Gem profilen igen for at normalisere data.",
      }
    }

    return {
      profile: mapProfileRowToBrandProfile(parsedRow.data),
      canSubmit: true,
      notice: null,
    }
  } catch {
    return {
      profile: null,
      canSubmit: false,
      notice: "Der opstod en fejl under initialisering af onboarding.",
    }
  }
}

export async function upsertBrandProfileForCurrentUser(
  input: OnboardingFormInput
): Promise<UpsertBrandProfileResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message:
        "Supabase mangler konfiguration. Sæt miljøvariablerne før du gemmer.",
    }
  }

  try {
    const supabase = await createSupabaseServerClient()
    const userId = await resolveCurrentUserId(supabase)

    if (!userId) {
      return {
        success: false,
        message: "Du skal være logget ind for at gemme din brand profile.",
      }
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          tone_level: input.toneLevel,
          length_preference: input.lengthPreference,
          opinion_level: input.opinionLevel,
          preferred_words: input.preferredWords,
          banned_words: input.bannedWords,
          voice_sample: input.voiceSample ?? null,
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single()

    if (error) {
      return {
        success: false,
        message:
          "Kunne ikke gemme brand profile i databasen. Prøv igen om et øjeblik.",
      }
    }

    const parsedRow = profileRowSchema.safeParse(data)

    if (!parsedRow.success) {
      return {
        success: false,
        message:
          "Brand profile blev gemt, men svaret kunne ikke valideres. Prøv at hente siden igen.",
      }
    }

    return {
      success: true,
      profile: mapProfileRowToBrandProfile(parsedRow.data),
    }
  } catch {
    return {
      success: false,
      message: "Noget gik galt under gemning af brand profile.",
    }
  }
}
