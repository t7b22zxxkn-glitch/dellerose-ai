import { CalendarDays } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SchedulerList } from "@/features/scheduler/components/scheduler-list"
import { WorkflowHydrator } from "@/features/workflow/components/workflow-hydrator"
import { getLatestPersistedWorkflow } from "@/features/workflow/queries"

export default async function SchedulerPage() {
  const persistedWorkflow = await getLatestPersistedWorkflow()

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto mb-8 max-w-5xl space-y-3">
        <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-sm">
          <CalendarDays className="h-4 w-4" />
          Modul 4 · Scheduler
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">PostPlan liste</h1>
        <p className="text-muted-foreground">
          Simpel statusstyring med flowet pending → scheduled → posted.
        </p>
      </section>

      <WorkflowHydrator snapshot={persistedWorkflow.snapshot} />

      {persistedWorkflow.notice ? (
        <section className="mx-auto mb-6 max-w-5xl">
          <Alert>
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>{persistedWorkflow.notice}</AlertDescription>
          </Alert>
        </section>
      ) : null}

      <div className="mx-auto max-w-5xl">
        <SchedulerList />
      </div>
    </main>
  )
}
