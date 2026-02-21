import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config"

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  if (!isSupabaseConfigured()) {
    return response
  }

  const { url, anonKey } = getSupabaseConfig()

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value)
        }

        response = NextResponse.next({
          request,
        })

        for (const cookie of cookiesToSet) {
          response.cookies.set(cookie.name, cookie.value, cookie.options)
        }
      },
    },
  })

  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
