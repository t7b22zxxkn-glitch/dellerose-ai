"use client"

import { useMemo } from "react"
import { AlertCircle, CheckCircle2, Loader2, Mic, RefreshCcw, Square } from "lucide-react"

import { BRAND_BLUEPRINT_PATH_OPTIONS } from "@/features/brand-blueprint/constants"
import { useBrandBlueprintStudio } from "@/features/brand-blueprint/hooks/use-brand-blueprint-studio"
import type { BrandBlueprintBootstrap } from "@/features/brand-blueprint/types"

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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type BrandBlueprintStudioProps = {
  bootstrap: BrandBlueprintBootstrap
}

function stageLabel(stage: string): string {
  if (stage === "listening") {
    return "Optager..."
  }
  if (stage === "transcribing") {
    return "Transskriberer..."
  }
  if (stage === "analyzing") {
    return "Analyserer Brand Blueprint..."
  }
  if (stage === "error") {
    return "Der opstod en fejl"
  }
  return "Klar"
}

export function BrandBlueprintStudio({ bootstrap }: BrandBlueprintStudioProps) {
  const studio = useBrandBlueprintStudio(bootstrap.activeBlueprint)

  const progressLabel = useMemo(
    () => `${studio.questionIndex + 1} / 3`,
    [studio.questionIndex]
  )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Brand Blueprint</CardTitle>
          <CardDescription>
            Tal frit og ærligt. Du behøver ikke formulere dig perfekt. DelleRose.ai
            hjælper dig bagefter med at formulere et konkret brandfundament.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Vælg retning</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {BRAND_BLUEPRINT_PATH_OPTIONS.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant={studio.selectedPath === option.id ? "default" : "outline"}
                onClick={() => studio.setSelectedPath(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {bootstrap.notice ? (
            <Alert>
              <AlertTitle>Info</AlertTitle>
              <AlertDescription>{bootstrap.notice}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Interview · spørgsmål {progressLabel}</span>
            <span className="text-xs text-muted-foreground">{stageLabel(studio.stage)}</span>
          </CardTitle>
          <CardDescription>{studio.currentQuestion?.prompt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={studio.isRecording ? studio.stopRecording : () => void studio.startRecording()}
              disabled={studio.stage === "transcribing" || studio.stage === "analyzing"}
            >
              {studio.isRecording ? (
                <>
                  <Square className="h-4 w-4" />
                  Stop optagelse
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  Start optagelse
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={studio.goToPreviousQuestion}
              disabled={studio.questionIndex === 0}
            >
              Tilbage
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={studio.goToNextQuestion}
              disabled={
                studio.questionIndex >= 2 ||
                studio.answers[studio.questionIndex]?.trim().length === 0
              }
            >
              Næste
            </Button>
          </div>

          {studio.stage === "transcribing" || studio.stage === "analyzing" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Arbejder...
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Svar (redigerbart transcript)</Label>
            <Textarea
              value={studio.answers[studio.questionIndex] ?? ""}
              onChange={(event) => {
                const next = [...studio.answers]
                next[studio.questionIndex] = event.target.value
                studio.setAnswers(next)
              }}
              className="min-h-[120px]"
              placeholder="Dit transskriberede svar vises her."
            />
          </div>

          <Button
            type="button"
            onClick={() => void studio.runAnalysis()}
            disabled={!studio.canAnalyze || studio.stage === "analyzing"}
          >
            {studio.stage === "analyzing" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyserer...
              </>
            ) : (
              "Byg mit Brand Blueprint"
            )}
          </Button>
        </CardContent>
      </Card>

      {studio.errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Kunne ikke gennemføre handling</AlertTitle>
          <AlertDescription>{studio.errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {studio.activeBlueprint ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Dit Brand Blueprint</span>
              <span className="text-xs uppercase text-muted-foreground">
                {studio.activeBlueprint.status} · v{studio.activeBlueprint.version}
              </span>
            </CardTitle>
            <CardDescription>
              Niche, målgruppe, tone og 3 content pillars genereret i Brand Architect Mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 rounded-md border p-3">
                <p className="text-xs uppercase text-muted-foreground">Din niche</p>
                <p>{studio.manualBlueprint.niche}</p>
              </div>
              <div className="space-y-1 rounded-md border p-3">
                <p className="text-xs uppercase text-muted-foreground">Din målgruppe</p>
                <p>{studio.manualBlueprint.audience}</p>
              </div>
            </div>

            <div className="space-y-1 rounded-md border p-3">
              <p className="text-xs uppercase text-muted-foreground">Din tone</p>
              <p>{studio.manualBlueprint.brandTone}</p>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs uppercase text-muted-foreground">Dine 3 content pillars</p>
              <ul className="space-y-2">
                {studio.manualBlueprint.contentPillars.map((pillar, index) => (
                  <li key={`${pillar.title}-${index}`} className="rounded-md border p-2">
                    <p className="font-medium">{pillar.title}</p>
                    <p className="text-sm text-muted-foreground">{pillar.description}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs uppercase text-muted-foreground">Elevator pitch</p>
              <p className="text-sm">{studio.manualBlueprint.elevatorPitch}</p>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs uppercase text-muted-foreground">Kort bio</p>
              <p className="text-sm">{studio.manualBlueprint.bioShort}</p>
            </div>

            {studio.isEditingManual ? (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <p className="text-xs uppercase text-muted-foreground">Manuel redigering</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Niche</Label>
                    <Input
                      value={studio.manualBlueprint.niche}
                      onChange={(event) =>
                        studio.setManualBlueprint({
                          ...studio.manualBlueprint,
                          niche: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Målgruppe</Label>
                    <Input
                      value={studio.manualBlueprint.audience}
                      onChange={(event) =>
                        studio.setManualBlueprint({
                          ...studio.manualBlueprint,
                          audience: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Tone</Label>
                    <Input
                      value={studio.manualBlueprint.brandTone}
                      onChange={(event) =>
                        studio.setManualBlueprint({
                          ...studio.manualBlueprint,
                          brandTone: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Personality traits (kommasepareret)</Label>
                  <Input
                    value={studio.manualBlueprint.personalityTraits.join(", ")}
                    onChange={(event) =>
                      studio.setManualBlueprint({
                        ...studio.manualBlueprint,
                        personalityTraits: event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter((item) => item.length > 0)
                          .slice(0, 5),
                      })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label>Elevator pitch</Label>
                  <Textarea
                    value={studio.manualBlueprint.elevatorPitch}
                    onChange={(event) =>
                      studio.setManualBlueprint({
                        ...studio.manualBlueprint,
                        elevatorPitch: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label>Kort bio</Label>
                  <Textarea
                    value={studio.manualBlueprint.bioShort}
                    onChange={(event) =>
                      studio.setManualBlueprint({
                        ...studio.manualBlueprint,
                        bioShort: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Content pillars (3)</Label>
                  {studio.manualBlueprint.contentPillars.map((pillar, index) => (
                    <div key={`edit-pillar-${index}`} className="rounded-md border p-2 space-y-2">
                      <Input
                        value={pillar.title}
                        placeholder={`Pillar ${index + 1} titel`}
                        onChange={(event) =>
                          studio.setManualBlueprint({
                            ...studio.manualBlueprint,
                            contentPillars: studio.manualBlueprint.contentPillars.map(
                              (item, pillarIndex) =>
                                pillarIndex === index
                                  ? { ...item, title: event.target.value }
                                  : item
                            ),
                          })
                        }
                      />
                      <Textarea
                        value={pillar.description}
                        placeholder={`Pillar ${index + 1} beskrivelse`}
                        onChange={(event) =>
                          studio.setManualBlueprint({
                            ...studio.manualBlueprint,
                            contentPillars: studio.manualBlueprint.contentPillars.map(
                              (item, pillarIndex) =>
                                pillarIndex === index
                                  ? { ...item, description: event.target.value }
                                  : item
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>

                <Button type="button" onClick={() => void studio.saveManualBlueprint()}>
                  Gem manuel redigering
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void studio.approveBlueprint()} disabled={studio.isApproving}>
                <CheckCircle2 className="h-4 w-4" />
                {studio.isApproving ? "Godkender..." : "Godkend blueprint"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void studio.runAnalysis()}>
                <RefreshCcw className="h-4 w-4" />
                Generér nyt forslag
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => studio.setIsEditingManual((previous) => !previous)}
              >
                {studio.isEditingManual ? "Luk redigering" : "Redigér manuelt"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
