import "server-only"

import { redirect } from "next/navigation"

import { getActiveBrandBlueprintForCurrentUser } from "@/features/brand-blueprint/service"
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

function buildBrandBlueprintPath(nextPath: string): string {
  const params = new URLSearchParams({
    next: nextPath,
    reason: "blueprint-required",
  })
  return `/brand-blueprint?${params.toString()}`
}

export async function requireApprovedBrandBlueprint(nextPath: string): Promise<void> {
  const blueprint = await getActiveBrandBlueprintForCurrentUser()
  if (!blueprint || blueprint.status !== "approved") {
    redirect(buildBrandBlueprintPath(nextPath))
  }
}
