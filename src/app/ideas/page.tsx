import { Lightbulb } from "lucide-react"

import { IdeaGeneratorPanel } from "@/features/idea-generator/components/idea-generator-panel"
import { requireApprovedBrandBlueprint, requireAuthenticatedUser } from "@/lib/auth/guards"

export default async function IdeasPage() {
  await requireAuthenticatedUser("/ideas")
  await requireApprovedBrandBlueprint("/ideas")

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto mb-8 max-w-5xl space-y-3">
        <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-sm">
          <Lightbulb className="h-4 w-4" />
          Ide-generator
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Giv mig en idé</h1>
        <p className="text-muted-foreground">
          Idéer bliver genereret ud fra dit godkendte Brand Blueprint og kan bruges
          direkte i Brain Dump eller Creative Room.
        </p>
      </section>

      <IdeaGeneratorPanel />
    </main>
  )
}
