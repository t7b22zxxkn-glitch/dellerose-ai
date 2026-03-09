import "server-only"

import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

import { getSupabaseConfig } from "@/lib/supabase/config"

const supabaseAdminEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

export function isSupabaseAdminConfigured(): boolean {
  return supabaseAdminEnvSchema.safeParse(process.env).success
}

export function createSupabaseAdminClient() {
  const parsed = supabaseAdminEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
  }

  const { url } = getSupabaseConfig()
  return createClient(url, parsed.data.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
