import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export type AuthSessionState = {
  userId: string | null
  email: string | null
  isAuthenticated: boolean
}

export async function getAuthSessionState(): Promise<AuthSessionState> {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return {
      userId: user?.id ?? null,
      email: user?.email ?? null,
      isAuthenticated: Boolean(user?.id),
    }
  } catch {
    return {
      userId: null,
      email: null,
      isAuthenticated: false,
    }
  }
}
