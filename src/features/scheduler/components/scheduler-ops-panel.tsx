import type { SchedulerOpsSnapshot } from "@/features/scheduler/types"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return "Ikke sat"
  }

  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return "Ugyldig dato"
  }

  return parsed.toLocaleString("da-DK")
}

type SchedulerOpsPanelProps = {
  snapshot: SchedulerOpsSnapshot | null
  notice: string | null
}

export function SchedulerOpsPanel({ snapshot, notice }: SchedulerOpsPanelProps) {
  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Scheduler ops-overblik</CardTitle>
          <CardDescription>
            {notice ?? "Ingen data tilgængelig endnu for publish jobs."}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduler ops-overblik</CardTitle>
        <CardDescription>
          Queue helbred for aktuelt workflow scope (total jobs: {snapshot.totalJobs}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-5">
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="text-muted-foreground">Queued</p>
            <p className="text-lg font-semibold">{snapshot.statusCounts.queued}</p>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="text-muted-foreground">Processing</p>
            <p className="text-lg font-semibold">{snapshot.statusCounts.processing}</p>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="text-muted-foreground">Retrying</p>
            <p className="text-lg font-semibold">{snapshot.statusCounts.retrying}</p>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="text-muted-foreground">Failed</p>
            <p className="text-lg font-semibold">{snapshot.statusCounts.failed}</p>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="text-muted-foreground">Published</p>
            <p className="text-lg font-semibold">{snapshot.statusCounts.published}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Attention jobs (retrying/failed)
          </p>
          {snapshot.attentionJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen retrying/failed jobs i dette scope.
            </p>
          ) : (
            <div className="space-y-2">
              {snapshot.attentionJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-md border bg-background p-3 text-xs space-y-1"
                >
                  <p>
                    <span className="font-semibold capitalize">{job.platform}</span> · status:{" "}
                    {job.status}
                  </p>
                  <p className="text-muted-foreground">
                    Attempts: {job.attemptCount}/{job.maxAttempts}
                  </p>
                  <p className="text-muted-foreground">
                    Next retry: {formatDateTime(job.nextRetryAt)}
                  </p>
                  <p className="text-muted-foreground">
                    Updated: {formatDateTime(job.updatedAt)}
                  </p>
                  {job.lastError ? <p className="text-rose-700">Fejl: {job.lastError}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
