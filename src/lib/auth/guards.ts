import "server-only"

import { redirect } from "next/navigation"

import { resolveCurrentUserId } from "@/lib/supabase/auth"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function buildLoginPath(nextPath: string, reason: "auth-required" | "config-missing"): string {
  const params = new URLSearchParams({
    next: nextPath,
    reason,
  })
  return `/login?${params.toString()}`
}

export async function requireAuthenticatedUser(nextPath: string): Promise<string> {
  if (!isSupabaseConfigured()) {
    redirect(buildLoginPath(nextPath, "config-missing"))
  }

  const supabase = await createSupabaseServerClient()
  const userId = await resolveCurrentUserId(supabase)

  if (!userId) {
    redirect(buildLoginPath(nextPath, "auth-required"))
  }

  return userId
}
