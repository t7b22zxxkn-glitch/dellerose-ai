import { WandSparkles } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form"
import { getOnboardingBootstrap } from "@/features/onboarding/service"
import { requireAuthenticatedUser } from "@/lib/auth/guards"

export default async function OnboardingPage() {
  await requireAuthenticatedUser("/onboarding")
  const bootstrap = await getOnboardingBootstrap()

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto mb-8 max-w-3xl space-y-3">
        <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-sm">
          <WandSparkles className="h-4 w-4" />
          DelleRose.ai · MVP v1
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Onboarding</h1>
        <p className="text-muted-foreground">
          Onboarding består af Brand Blueprint (strategi) og Brand Profile
          (operationelle præferencer). Begge bruges af Master Agent og
          platform-agenter for konsistent output.
        </p>
        <div>
          <Button asChild variant="outline">
            <Link href="/brand-blueprint">Start Brand Blueprint</Link>
          </Button>
        </div>
      </section>

      <OnboardingForm
        initialProfile={bootstrap.profile}
        initialBlueprint={bootstrap.blueprint}
        canSubmit={bootstrap.canSubmit}
        notice={bootstrap.notice}
      />
    </main>
  )
}
