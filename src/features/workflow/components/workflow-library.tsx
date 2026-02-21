import Link from "next/link"

import type { WorkflowListItem } from "@/features/workflow/types"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type WorkflowLibraryProps = {
  items: WorkflowListItem[]
  selectedWorkflowId?: string
  basePath: "/creative-room" | "/scheduler" | "/workflows"
}

function trimPreview(text: string, maxLength = 120): string {
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength).trim()}...`
}

export function WorkflowLibrary({
  items,
  selectedWorkflowId,
  basePath,
}: WorkflowLibraryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mine workflows</CardTitle>
        <CardDescription>
          Vælg et workflow for at indlæse tidligere brief, drafts og plan-status.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 ? (
          items.map((item) => {
            const isSelected = item.workflowId === selectedWorkflowId
            const href =
              basePath === "/workflows"
                ? `/creative-room?workflow=${item.workflowId}`
                : `${basePath}?workflow=${item.workflowId}`

            return (
              <Link
                key={item.workflowId}
                href={href}
                className={`block rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.intent}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(item.createdAt).toLocaleString("da-DK")}
                  </span>
                </div>
                <p className="text-sm font-medium">{trimPreview(item.coreMessage)}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Posts: {item.postCount} · Scheduled:{" "}
                  {item.hasScheduledPosts ? "ja" : "nej"} · Posted:{" "}
                  {item.hasPostedPosts ? "ja" : "nej"}
                </p>
              </Link>
            )
          })
        ) : (
          <p className="text-muted-foreground text-sm">Ingen workflows endnu.</p>
        )}
      </CardContent>
    </Card>
  )
}
