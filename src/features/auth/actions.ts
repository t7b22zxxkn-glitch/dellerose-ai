"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

import type { AuthFormState } from "./types"

const authModeSchema = z.enum(["sign-in", "sign-up"])

const authInputSchema = z.object({
  mode: authModeSchema,
  email: z.string().trim().email("Indtast en gyldig email."),
  password: z
    .string()
    .min(8, "Password skal være mindst 8 tegn.")
    .max(128, "Password er for langt."),
  nextPath: z.string().default("/onboarding"),
})

function toSafeNextPath(candidate: string): string {
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate
  }

  return "/onboarding"
}

export async function submitAuthAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  try {
    if (!isSupabaseConfigured()) {
      return {
        status: "error",
        message:
          "Supabase er ikke konfigureret. Tilføj NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_ANON_KEY i Vercel.",
      }
    }

    const parsedInput = authInputSchema.safeParse({
      mode: formData.get("mode"),
      email: formData.get("email"),
      password: formData.get("password"),
      nextPath: formData.get("nextPath"),
    })

    if (!parsedInput.success) {
      return {
        status: "error",
        message: parsedInput.error.issues[0]?.message ?? "Ugyldige login-oplysninger.",
      }
    }

    const input = parsedInput.data
    const supabase = await createSupabaseServerClient()

    if (input.mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      })

      if (error) {
        return {
          status: "error",
          message: "Login fejlede. Kontroller email og password.",
        }
      }

      redirect(toSafeNextPath(input.nextPath))
    }

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
    })

    if (error) {
      return {
        status: "error",
        message: "Kunne ikke oprette bruger. Prøv en anden email.",
      }
    }

    if (data.session) {
      redirect(toSafeNextPath(input.nextPath))
    }

    return {
      status: "success",
      message:
        "Bruger oprettet. Hvis email-bekræftelse er slået til i Supabase, skal du bekræfte din email før login.",
    }
  } catch {
    return {
      status: "error",
      message: "Uventet fejl under login/signup.",
    }
  }
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut()
  }

  redirect("/login")
}
