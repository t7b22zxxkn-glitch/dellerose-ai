import { Compass } from "lucide-react"

import { BrandBlueprintStudio } from "@/features/brand-blueprint/components/brand-blueprint-studio"
import { getBrandBlueprintBootstrapForCurrentUser } from "@/features/brand-blueprint/service"
import { requireAuthenticatedUser } from "@/lib/auth/guards"

export default async function BrandBlueprintPage() {
  await requireAuthenticatedUser("/brand-blueprint")
  const bootstrap = await getBrandBlueprintBootstrapForCurrentUser()

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto mb-8 max-w-5xl space-y-3">
        <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-sm">
          <Compass className="h-4 w-4" />
          Onboarding · Brand Blueprint
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Brand Blueprint</h1>
        <p className="text-muted-foreground">
          Et kort 3-spørgsmåls voice interview, der hjælper dig med at formulere niche,
          målgruppe, tone og content pillars før content-produktion.
        </p>
      </section>

      <BrandBlueprintStudio bootstrap={bootstrap} />
    </main>
  )
}
