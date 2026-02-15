import { WandSparkles } from "lucide-react"

import { OnboardingForm } from "@/features/onboarding/components/onboarding-form"
import { getOnboardingBootstrap } from "@/features/onboarding/service"

export default async function OnboardingPage() {
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
          Første step i workflowet er en Brand Profile. Denne bruges af Master
          Agent og alle platform-agenter for konsistent output.
        </p>
      </section>

      <OnboardingForm
        initialProfile={bootstrap.profile}
        canSubmit={bootstrap.canSubmit}
        notice={bootstrap.notice}
      />
    </main>
  )
}
