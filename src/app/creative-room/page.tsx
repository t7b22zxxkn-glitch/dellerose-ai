import { Layers } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CreativeRoomWorkspace } from "@/features/creative-room/components/creative-room-workspace"
import { WorkflowHydrator } from "@/features/workflow/components/workflow-hydrator"
import { getLatestPersistedWorkflow } from "@/features/workflow/queries"

export default async function CreativeRoomPage() {
  const persistedWorkflow = await getLatestPersistedWorkflow()

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto mb-8 max-w-7xl space-y-3">
        <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-sm">
          <Layers className="h-4 w-4" />
          Modul 3 · Creative Room
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Review, redigér og godkend drafts
        </h1>
        <p className="text-muted-foreground">
          Chat-log i venstre side og platform preview cards i højre side.
          Godkendte drafts sendes videre til Scheduler.
        </p>
      </section>

      <WorkflowHydrator snapshot={persistedWorkflow.snapshot} />

      {persistedWorkflow.notice ? (
        <section className="mx-auto mb-6 max-w-7xl">
          <Alert>
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>{persistedWorkflow.notice}</AlertDescription>
          </Alert>
        </section>
      ) : null}

      <CreativeRoomWorkspace />
    </main>
  )
}
