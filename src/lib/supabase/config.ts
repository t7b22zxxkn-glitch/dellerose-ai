import { z } from "zod"

const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

export function isSupabaseConfigured(): boolean {
  return supabaseEnvSchema.safeParse(process.env).success
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const parsed = supabaseEnvSchema.safeParse(process.env)

  if (!parsed.success) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }

  return {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
}
