import Link from "next/link"

import { signOutAction } from "@/features/auth/actions"
import { getAuthSessionState } from "@/lib/auth/session"

import { Button } from "@/components/ui/button"

export async function AppHeader() {
  const auth = await getAuthSessionState()

  return (
    <header className="border-b bg-background/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold tracking-tight">
            DelleRose.ai
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link href="/onboarding">Onboarding</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/brain-dump">Brain Dump</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/creative-room">Creative Room</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/scheduler">Scheduler</Link>
            </Button>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {auth.isAuthenticated ? (
            <>
              <span className="text-muted-foreground hidden text-xs md:inline">
                {auth.email ?? "Logget ind"}
              </span>
              <form action={signOutAction}>
                <Button type="submit" size="sm" variant="outline">
                  Log ud
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Log ind</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
