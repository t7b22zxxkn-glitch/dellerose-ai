import "server-only"

import { redirect } from "next/navigation"

import { resolveCurrentUserId } from "@/lib/supabase/auth"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function buildLoginPath(nextPath: string): string {
  const params = new URLSearchParams({
    next: nextPath,
  })
  return `/login?${params.toString()}`
}

export async function requireAuthenticatedUser(nextPath: string): Promise<string> {
  if (!isSupabaseConfigured()) {
    redirect(buildLoginPath(nextPath))
  }

  const supabase = await createSupabaseServerClient()
  const userId = await resolveCurrentUserId(supabase)

  if (!userId) {
    redirect(buildLoginPath(nextPath))
  }

  return userId
}
