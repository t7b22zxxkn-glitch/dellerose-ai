"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { CalendarDays, CheckCircle2, ClipboardCopy, Clock3 } from "lucide-react"

import { updatePersistedPostPlanStatusAction } from "@/features/scheduler/actions"
import { useWorkflowStore } from "@/features/workflow/store"
import { formatActionErrorMessage } from "@/lib/server-actions/contracts"
import type { PostPlan } from "@/lib/types/domain"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return "Ingen dato sat"
  }
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return "Ugyldig dato"
  }
  return parsed.toLocaleString("da-DK")
}

function toIsoDateOrNull(dateValue: string): string | null {
  if (!dateValue) {
    return null
  }

  const date = new Date(`${dateValue}T09:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

function statusClassName(status: PostPlan["status"]): string {
  if (status === "pending") {
    return "bg-amber-100 text-amber-900 border-amber-200"
  }
  if (status === "scheduled") {
    return "bg-blue-100 text-blue-900 border-blue-200"
  }
  return "bg-emerald-100 text-emerald-900 border-emerald-200"
}

function getStatusLabel(status: PostPlan["status"]): string {
  if (status === "pending") {
    return "pending"
  }
  if (status === "scheduled") {
    return "scheduled"
  }
  return "posted"
}

function sortPlansByDate(plans: PostPlan[]): PostPlan[] {
  return [...plans].sort((left, right) => {
    const leftTime = left.scheduledFor ? new Date(left.scheduledFor).getTime() : Infinity
    const rightTime = right.scheduledFor
      ? new Date(right.scheduledFor).getTime()
      : Infinity
    return leftTime - rightTime
  })
}

function toDateInputValue(iso: string | null): string {
  if (!iso) {
    return ""
  }
  return iso.slice(0, 10)
}

export function SchedulerList() {
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const plans = useWorkflowStore((state) => state.postPlans)
  const setPlanScheduled = useWorkflowStore((state) => state.setPlanScheduled)
  const markPlanPosted = useWorkflowStore((state) => state.markPlanPosted)
  const [draftDateByPlanId, setDraftDateByPlanId] = useState<Record<string, string>>({})
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const sortedPlans = useMemo(() => sortPlansByDate(plans), [plans])

  const copyPlanText = async (plan: PostPlan) => {
    try {
      const payload = `${plan.hook}\n\n${plan.body}\n\n${plan.cta}\n\n${plan.hashtags.join(" ")}`
      await navigator.clipboard.writeText(payload)
      setFeedbackMessage(`Indhold for ${plan.platform} er kopieret til udklipsholderen.`)
    } catch {
      setFeedbackMessage("Kunne ikke kopiere til udklipsholder.")
    }
  }

  if (sortedPlans.length === 0) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Ingen plan-items endnu</CardTitle>
          <CardDescription>
            Godkend et eller flere cards i Creative Room først.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/creative-room">Gå til Creative Room</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {feedbackMessage ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Handling udført</AlertTitle>
          <AlertDescription>{feedbackMessage}</AlertDescription>
        </Alert>
      ) : null}

      {sortedPlans.map((plan) => {
        const dateValue = draftDateByPlanId[plan.id] ?? toDateInputValue(plan.scheduledFor)

        return (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="capitalize">{plan.platform}</span>
                <span
                  className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClassName(plan.status)}`}
                >
                  {getStatusLabel(plan.status)}
                </span>
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                {formatDateTime(plan.scheduledFor)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="font-medium">{plan.hook}</p>
              <p>{plan.body}</p>
              <p>{plan.cta}</p>

              <div className="flex flex-wrap gap-2">
                {plan.hashtags.map((tag) => (
                  <span
                    key={`${plan.id}-${tag}`}
                    className="rounded-md border bg-muted px-2 py-1 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="text-muted-foreground text-xs">
                Visual: {plan.visualSuggestion}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyPlanText(plan)}
                >
                  <ClipboardCopy className="h-4 w-4" />
                  Kopiér til manuel posting
                </Button>
              </div>

              {plan.status !== "posted" ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    type="date"
                    className="max-w-[220px]"
                    value={dateValue}
                    onChange={(event) =>
                      setDraftDateByPlanId((previous) => ({
                        ...previous,
                        [plan.id]: event.target.value,
                      }))
                    }
                  />
                  {plan.status === "pending" ? (
                    <Button
                      type="button"
                      onClick={async () => {
                        const scheduledFor = toIsoDateOrNull(dateValue)
                        if (!scheduledFor) {
                          setFeedbackMessage("Vælg en gyldig dato før scheduling.")
                          return
                        }

                        const result = await updatePersistedPostPlanStatusAction({
                          workflowId,
                          platform: plan.platform,
                          status: "scheduled",
                          scheduledFor,
                        })

                        if (!result.success) {
                          setFeedbackMessage(formatActionErrorMessage(result))
                          return
                        }

                        setPlanScheduled(plan.id, scheduledFor)
                        setFeedbackMessage(`${plan.platform} blev sat til scheduled.`)
                      }}
                    >
                      <CalendarDays className="h-4 w-4" />
                      Sæt som scheduled
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={async () => {
                        const result = await updatePersistedPostPlanStatusAction({
                          workflowId,
                          platform: plan.platform,
                          status: "posted",
                        })

                        if (!result.success) {
                          setFeedbackMessage(formatActionErrorMessage(result))
                          return
                        }

                        markPlanPosted(plan.id)
                        setFeedbackMessage(`${plan.platform} blev markeret som posted.`)
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Markér posted
                    </Button>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
