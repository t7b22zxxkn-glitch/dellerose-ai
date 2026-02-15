"use client"

import { AlertCircle, Loader2, Mic, RotateCcw, Square } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  type BrainDumpStage,
  useBrainDumpRecorder,
} from "@/features/brain-dump/hooks/use-brain-dump-recorder"

function StatusIndicator({ stage }: { stage: BrainDumpStage }) {
  if (stage === "transcribing" || stage === "analyzing") {
    return <Loader2 className="h-4 w-4 animate-spin" />
  }

  if (stage === "error" || stage === "unsupported") {
    return <AlertCircle className="h-4 w-4" />
  }

  if (stage === "listening") {
    return <Mic className="h-4 w-4" />
  }

  return <Mic className="h-4 w-4" />
}

export function BrainDumpStudio() {
  const {
    stage,
    transcript,
    brief,
    platformDrafts,
    isGeneratingDrafts,
    platformDraftErrorMessage,
    errorMessage,
    isRecording,
    statusLabel,
    startRecording,
    stopRecording,
    generatePlatformDrafts,
    reset,
  } = useBrainDumpRecorder()

  const disablePrimaryButton =
    stage === "transcribing" || stage === "analyzing" || stage === "unsupported"

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Brain Dump</CardTitle>
          <CardDescription>
            Tal frit i mikrofonen. Systemet transskriberer med Whisper og sender
            derefter teksten til Master Agenten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center justify-center gap-4">
            <Button
              type="button"
              className="h-36 w-36 rounded-full text-lg"
              onClick={isRecording ? stopRecording : () => void startRecording()}
              disabled={disablePrimaryButton}
            >
              {isRecording ? (
                <Square className="h-8 w-8" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </Button>

            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <StatusIndicator stage={stage} />
              <span>{statusLabel}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={isRecording}
              >
                <RotateCcw className="h-4 w-4" />
                Nulstil
              </Button>
            </div>
          </div>

          {(stage === "error" || stage === "unsupported") && errorMessage ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Fejl i Brain Dump</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transskript</CardTitle>
          <CardDescription>Rå tekst efter Whisper-transskription.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            readOnly
            value={transcript}
            placeholder="Transskriptionen vises her efter optagelse."
            className="min-h-[180px]"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ContentBrief (Master Agent)</CardTitle>
          <CardDescription>
            Struktureret output, valideret med Zod.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {brief ? (
            <>
              <div>
                <p className="text-muted-foreground mb-1 font-medium">
                  Core message
                </p>
                <p>{brief.coreMessage}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 font-medium">Intent</p>
                <p>{brief.intent}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 font-medium">
                  Target audience
                </p>
                <p>{brief.targetAudience}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 font-medium">
                  Emotional tone
                </p>
                <p>{brief.emotionalTone}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 font-medium">
                  Key points
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {brief.keyPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              ContentBrief vises her efter analyse.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform drafts (Multi-Agent Engine)</CardTitle>
          <CardDescription>
            Kører LinkedIn, TikTok, Instagram, Facebook og X parallelt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            onClick={() => void generatePlatformDrafts()}
            disabled={!brief || isGeneratingDrafts || isRecording}
          >
            {isGeneratingDrafts ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Genererer...
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                Generer platform drafts
              </>
            )}
          </Button>

          {platformDraftErrorMessage ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Multi-Agent fejl</AlertTitle>
              <AlertDescription>{platformDraftErrorMessage}</AlertDescription>
            </Alert>
          ) : null}

          {platformDrafts.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {platformDrafts.map((draft) => (
                <Card key={draft.platform}>
                  <CardHeader>
                    <CardTitle className="text-base capitalize">
                      {draft.platform}
                    </CardTitle>
                    <CardDescription>Status: {draft.status}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <p className="text-muted-foreground mb-1 font-medium">Hook</p>
                      <p>{draft.hook}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1 font-medium">Body</p>
                      <p>{draft.body}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1 font-medium">CTA</p>
                      <p>{draft.cta}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1 font-medium">
                        Hashtags
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {draft.hashtags.length > 0 ? (
                          draft.hashtags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md border bg-muted px-2 py-1 text-xs"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            Ingen hashtags
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1 font-medium">
                        Visual suggestion
                      </p>
                      <p>{draft.visualSuggestion}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Ingen platform-drafts endnu.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
