"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  MessageSquareText,
  RefreshCcw,
} from "lucide-react"

import { regeneratePlatformDraftAction } from "@/features/agent-engine/actions"
import { upsertPostPlanAction } from "@/features/scheduler/actions"
import { useWorkflowStore } from "@/features/workflow/store"
import type { AgentOutput, ContentBrief, Platform } from "@/lib/types/domain"

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
import { Textarea } from "@/components/ui/textarea"

type EditableField = "hook" | "body" | "cta" | null

type DraftCardProps = {
  workflowId: string
  transcript: string
  brief: ContentBrief
  draft: AgentOutput
  persistDraft: (draft: AgentOutput) => Promise<{
    success: boolean
    message?: string
  }>
  onReplaceDraft: (nextDraft: AgentOutput) => void
  onUpdateField: (
    platform: Platform,
    field: "hook" | "body" | "cta",
    value: string
  ) => void
  onApproveAndPlan: (platform: Platform, scheduledFor: string | null) => void
}

function getPlatformLabel(platform: Platform): string {
  if (platform === "twitter") {
    return "X (Twitter)"
  }
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}

function toIsoDateOrNull(dateValue: string): string | null {
  if (!dateValue) {
    return null
  }

  const parsed = new Date(`${dateValue}T09:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function DraftPreviewCard({
  workflowId,
  transcript,
  brief,
  draft,
  persistDraft,
  onReplaceDraft,
  onUpdateField,
  onApproveAndPlan,
}: DraftCardProps) {
  const [editingField, setEditingField] = useState<EditableField>(null)
  const [editingValue, setEditingValue] = useState("")
  const [scheduledDate, setScheduledDate] = useState("")
  const [cardErrorMessage, setCardErrorMessage] = useState<string | null>(null)
  const [isRegenerating, startRegenerate] = useTransition()
  const [isPersistingPlan, startPersistPlan] = useTransition()

  const isFieldLocked = editingField !== null
  const platformLabel = useMemo(
    () => getPlatformLabel(draft.platform),
    [draft.platform]
  )

  const saveField = () => {
    if (!editingField) {
      return
    }

    const trimmed = editingValue.trim()
    if (!trimmed) {
      setCardErrorMessage("Feltet må ikke være tomt.")
      return
    }

    startPersistPlan(async () => {
      const nextDraft: AgentOutput =
        editingField === "hook"
          ? { ...draft, hook: trimmed }
          : editingField === "body"
            ? { ...draft, body: trimmed }
            : { ...draft, cta: trimmed }

      const persistResult = await persistDraft(nextDraft)
      if (!persistResult.success) {
        setCardErrorMessage(
          persistResult.message ?? "Kunne ikke gemme draft i databasen."
        )
        return
      }

      onUpdateField(draft.platform, editingField, trimmed)
      setEditingField(null)
      setCardErrorMessage(null)
    })
  }

  const cancelEdit = () => {
    setEditingField(null)
    setEditingValue("")
    setCardErrorMessage(null)
  }

  const handleRegenerate = () => {
    startRegenerate(async () => {
      const result = await regeneratePlatformDraftAction(draft.platform, brief)

      if (!result.success) {
        setCardErrorMessage(result.message)
        return
      }

      const regeneratedDraft: AgentOutput = {
        ...result.output,
        status: draft.status,
      }

      const persistResult = await persistDraft(regeneratedDraft)
      if (!persistResult.success) {
        setCardErrorMessage(
          persistResult.message ?? "Kunne ikke gemme regenereret draft."
        )
        return
      }

      onReplaceDraft(regeneratedDraft)
      setCardErrorMessage(null)
    })
  }

  const handleApproveAndPlan = () => {
    const scheduledFor = toIsoDateOrNull(scheduledDate)
    if (scheduledDate && !scheduledFor) {
      setCardErrorMessage("Datoen er ugyldig.")
      return
    }

    startPersistPlan(async () => {
      const result = await upsertPostPlanAction({
        workflowId,
        transcript,
        brief,
        draft,
        scheduledFor,
      })

      if (!result.success) {
        setCardErrorMessage(result.message)
        return
      }

      onApproveAndPlan(draft.platform, scheduledFor)
      setCardErrorMessage(null)
    })
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{platformLabel} Preview</span>
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            {draft.status}
          </span>
        </CardTitle>
        <CardDescription>
          Klik på tekstfelter for at gå i redigeringsmode.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="mb-3 space-y-1">
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              Hook
            </p>
            {editingField === "hook" ? (
              <Textarea
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                className="min-h-[70px] bg-background"
              />
            ) : (
              <button
                type="button"
                className="w-full text-left font-semibold"
                onClick={() => {
                  setEditingField("hook")
                  setEditingValue(draft.hook)
                }}
                disabled={isFieldLocked}
              >
                {draft.hook}
              </button>
            )}
          </div>

          <div className="mb-3 space-y-1">
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              Body
            </p>
            {editingField === "body" ? (
              <Textarea
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                className="min-h-[120px] bg-background"
              />
            ) : (
              <button
                type="button"
                className="w-full text-left"
                onClick={() => {
                  setEditingField("body")
                  setEditingValue(draft.body)
                }}
                disabled={isFieldLocked}
              >
                {draft.body}
              </button>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-semibold uppercase">
              CTA
            </p>
            {editingField === "cta" ? (
              <Textarea
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                className="min-h-[70px] bg-background"
              />
            ) : (
              <button
                type="button"
                className="w-full text-left font-medium"
                onClick={() => {
                  setEditingField("cta")
                  setEditingValue(draft.cta)
                }}
                disabled={isFieldLocked}
              >
                {draft.cta}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {draft.hashtags.map((tag) => (
            <span
              key={`${draft.platform}-${tag}`}
              className="rounded-md border bg-muted px-2 py-1 text-xs"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-semibold uppercase">
            Visual suggestion
          </p>
          <p className="text-sm">{draft.visualSuggestion}</p>
        </div>

        {cardErrorMessage ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Kunne ikke gennemføre handling</AlertTitle>
            <AlertDescription>{cardErrorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {editingField ? (
          <div className="flex items-center gap-2">
            <Button type="button" onClick={saveField} disabled={isPersistingPlan}>
              Gem felt
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={cancelEdit}
              disabled={isPersistingPlan}
            >
              Annuller
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleRegenerate}
                disabled={isRegenerating || isPersistingPlan || isFieldLocked}
              >
                <RefreshCcw className="h-4 w-4" />
                {isRegenerating ? "Regenererer..." : "Regenerate"}
              </Button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="date"
                value={scheduledDate}
                onChange={(event) => setScheduledDate(event.target.value)}
                className="max-w-[220px]"
              />
              <Button
                type="button"
                onClick={handleApproveAndPlan}
                disabled={isFieldLocked || isRegenerating || isPersistingPlan}
              >
                <CheckCircle2 className="h-4 w-4" />
                {isPersistingPlan ? "Gemmer..." : "Godkend & Planlæg"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function CreativeRoomWorkspace() {
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const transcript = useWorkflowStore((state) => state.transcript)
  const brief = useWorkflowStore((state) => state.brief)
  const drafts = useWorkflowStore((state) => state.drafts)
  const postPlans = useWorkflowStore((state) => state.postPlans)
  const chatLog = useWorkflowStore((state) => state.chatLog)
  const replaceDraft = useWorkflowStore((state) => state.replaceDraft)
  const updateDraftField = useWorkflowStore((state) => state.updateDraftField)
  const approveAndPlanDraft = useWorkflowStore((state) => state.approveAndPlanDraft)

  const persistDraft = async (draft: AgentOutput) => {
    const plan = postPlans.find((item) => item.platform === draft.platform)

    const result = await upsertPostPlanAction({
      workflowId,
      transcript,
      brief,
      draft,
      scheduledFor: plan?.scheduledFor ?? null,
    })

    if (!result.success) {
      return {
        success: false as const,
        message: result.message,
      }
    }

    return {
      success: true as const,
    }
  }

  if (!brief || drafts.length === 0) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Creative Room mangler data</CardTitle>
          <CardDescription>
            Kør Brain Dump og generér platform-drafts først.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/brain-dump">Gå til Brain Dump</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="h-[75vh]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5" />
            Chat Log
          </CardTitle>
          <CardDescription>
            Workflow-events og systembeskeder i rækkefølge.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[calc(100%-96px)] overflow-y-auto pr-2">
          <div className="space-y-3">
            {chatLog.length > 0 ? (
              chatLog.map((item) => (
                <div key={item.id} className="rounded-md border p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-muted-foreground text-xs uppercase">
                      {item.role}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p>{item.message}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                Ingen events endnu.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Klar til planlægning
            </CardTitle>
            <CardDescription>
              Efter godkendelse af cards kan du styre status i Scheduler.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/scheduler">Åbn Scheduler</Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {drafts.map((draft) => (
            <DraftPreviewCard
              key={draft.platform}
              workflowId={workflowId}
              transcript={transcript}
              brief={brief}
              draft={draft}
              persistDraft={persistDraft}
              onReplaceDraft={replaceDraft}
              onUpdateField={updateDraftField}
              onApproveAndPlan={approveAndPlanDraft}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
