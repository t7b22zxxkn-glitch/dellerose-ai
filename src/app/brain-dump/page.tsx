import { Mic } from "lucide-react"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { BrainDumpStudio } from "@/features/brain-dump/components/brain-dump-studio"
import { getOnboardingBootstrap } from "@/features/onboarding/service"
import { requireAuthenticatedUser } from "@/lib/auth/guards"

export default async function BrainDumpPage() {
  await requireAuthenticatedUser("/brain-dump")
  const onboarding = await getOnboardingBootstrap()
  const hasApprovedBlueprint = onboarding.blueprint?.status === "approved"

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto mb-8 max-w-4xl space-y-3">
        <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-sm">
          <Mic className="h-4 w-4" />
          Modul 1 · Brain Dump
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Voice input og transskription
        </h1>
        <p className="text-muted-foreground">
          Tal én rå idé. DelleRose.ai transskriberer lyd med Whisper og
          strukturerer derefter inputtet via Master Agenten.
        </p>
      </section>

      {!hasApprovedBlueprint ? (
        <section className="mx-auto mb-6 max-w-4xl">
          <Alert>
            <AlertTitle>Brand Blueprint anbefales før produktion</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                Kør den korte Brand Blueprint onboarding for at give Master Agent en
                strategisk brandretning (niche, målgruppe og content pillars).
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/brand-blueprint">Åbn Brand Blueprint</Link>
              </Button>
            </AlertDescription>
          </Alert>
        </section>
      ) : null}

      <BrainDumpStudio />
    </main>
  )
}
