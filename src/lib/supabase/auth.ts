import "server-only"

import { z } from "zod"

import { createSupabaseServerClient } from "@/lib/supabase/server"

const devUserIdSchema = z.string().uuid()

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

export async function resolveCurrentUserId(
  supabase: SupabaseServerClient
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user?.id) {
    return user.id
  }

  const allowDevFallback =
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEV_USER_FALLBACK === "true"

  if (allowDevFallback) {
    const devUserId = process.env.DELLEROSE_DEV_USER_ID
    const parsedDevUserId = devUserIdSchema.safeParse(devUserId)

    if (parsedDevUserId.success) {
      return parsedDevUserId.data
    }
  }

  return null
}
