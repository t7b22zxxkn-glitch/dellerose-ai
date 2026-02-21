import { Layers2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { WorkflowLibrary } from "@/features/workflow/components/workflow-library"
import { getPersistedWorkflowList } from "@/features/workflow/queries"
import { requireAuthenticatedUser } from "@/lib/auth/guards"

export default async function WorkflowsPage() {
  await requireAuthenticatedUser("/workflows")
  const workflows = await getPersistedWorkflowList()

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto mb-8 max-w-5xl space-y-3">
        <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-sm">
          <Layers2 className="h-4 w-4" />
          Workflow bibliotek
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Mine workflows</h1>
        <p className="text-muted-foreground">
          Historik over tidligere idéer og genereringer. Vælg et workflow for at
          åbne det i Creative Room eller Scheduler.
        </p>
      </section>

      <section className="mx-auto max-w-5xl space-y-4">
        {workflows.notice ? (
          <Alert>
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>{workflows.notice}</AlertDescription>
          </Alert>
        ) : null}

        <WorkflowLibrary items={workflows.items} basePath="/workflows" />
      </section>
    </main>
  )
}
