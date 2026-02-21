import { redirect } from "next/navigation"

import { AuthPanel } from "@/features/auth/components/auth-panel"
import { getAuthSessionState } from "@/lib/auth/session"

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string
    reason?: "auth-required" | "config-missing"
  }>
}

function toSafeNextPath(candidate: string | undefined): string {
  if (candidate && candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate
  }

  return "/onboarding"
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const nextPath = toSafeNextPath(resolvedSearchParams?.next)
  const auth = await getAuthSessionState()

  if (auth.isAuthenticated) {
    redirect(nextPath)
  }

  const notice =
    resolvedSearchParams?.reason === "config-missing"
      ? "Supabase mangler konfiguration i miljøvariabler."
      : resolvedSearchParams?.reason === "auth-required"
        ? "Log ind for at få adgang til denne side."
        : undefined

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto mb-6 max-w-md space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">DelleRose.ai Login</h1>
        <p className="text-muted-foreground text-sm">
          Log ind med Supabase Auth for at gemme og planlægge indhold.
        </p>
      </section>

      <AuthPanel nextPath={nextPath} notice={notice} />
    </main>
  )
}
