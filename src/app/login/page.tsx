import { AuthPanel } from "@/features/auth/components/auth-panel"

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string
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

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto mb-6 max-w-md space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">DelleRose.ai Login</h1>
        <p className="text-muted-foreground text-sm">
          Log ind med Supabase Auth for at gemme og planlægge indhold.
        </p>
      </section>

      <AuthPanel nextPath={nextPath} />
    </main>
  )
}
