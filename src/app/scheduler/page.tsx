import { CalendarDays } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SchedulerList } from "@/features/scheduler/components/scheduler-list"
import { WorkflowHydrator } from "@/features/workflow/components/workflow-hydrator"
import { WorkflowLibrary } from "@/features/workflow/components/workflow-library"
import {
  getPersistedWorkflowList,
  getPersistedWorkflowSnapshotById,
} from "@/features/workflow/queries"
import { requireAuthenticatedUser } from "@/lib/auth/guards"

type SchedulerPageProps = {
  searchParams?: Promise<{
    workflow?: string
  }>
}

export default async function SchedulerPage({ searchParams }: SchedulerPageProps) {
  await requireAuthenticatedUser("/scheduler")
  const workflowList = await getPersistedWorkflowList()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const requestedWorkflowId = resolvedSearchParams?.workflow
  const selectedWorkflowId = workflowList.items.some(
    (item) => item.workflowId === requestedWorkflowId
  )
    ? requestedWorkflowId
    : workflowList.items[0]?.workflowId

  const persistedWorkflow = selectedWorkflowId
    ? await getPersistedWorkflowSnapshotById(selectedWorkflowId)
    : {
        snapshot: null,
        notice: "Ingen workflow valgt endnu.",
      }

  const forceHydrate = Boolean(requestedWorkflowId && selectedWorkflowId)

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

      <WorkflowHydrator
        snapshot={persistedWorkflow.snapshot}
        forceHydrate={forceHydrate}
      />

      {workflowList.notice || persistedWorkflow.notice ? (
        <section className="mx-auto mb-6 max-w-5xl">
          <Alert>
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>
              {persistedWorkflow.notice ?? workflowList.notice}
            </AlertDescription>
          </Alert>
        </section>
      ) : null}

      <section className="mx-auto mb-6 max-w-5xl">
        <WorkflowLibrary
          items={workflowList.items}
          selectedWorkflowId={selectedWorkflowId}
          basePath="/scheduler"
        />
      </section>

      <div className="mx-auto max-w-5xl">
        <SchedulerList />
      </div>
    </main>
  )
}
