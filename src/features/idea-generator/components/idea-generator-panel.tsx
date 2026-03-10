"use client"

import { useState, useTransition } from "react"
import { Lightbulb, Loader2 } from "lucide-react"

import { generateIdeasAction } from "@/features/idea-generator/actions"
import { formatActionErrorMessage } from "@/lib/server-actions/contracts"
import type { IdeaGeneratorOutput } from "@/lib/agents/idea-generator"

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

export function IdeaGeneratorPanel() {
  const [ideasPerPillar, setIdeasPerPillar] = useState(3)
  const [result, setResult] = useState<IdeaGeneratorOutput | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isGenerating, startGeneration] = useTransition()

  const runGenerateIdeas = () => {
    startGeneration(async () => {
      setErrorMessage(null)
      const actionResult = await generateIdeasAction({
        ideasPerPillar,
      })

      if (!actionResult.success) {
        setResult(null)
        setErrorMessage(formatActionErrorMessage(actionResult))
        return
      }

      setResult(actionResult.ideas)
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Giv mig en idé
          </CardTitle>
          <CardDescription>
            Generér konkrete content-idéer ud fra dit godkendte Brand Blueprint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-[220px] space-y-1">
            <Label htmlFor="ideasPerPillar">Idéer per pillar (3-5)</Label>
            <Input
              id="ideasPerPillar"
              type="number"
              min={3}
              max={5}
              value={ideasPerPillar}
              onChange={(event) => {
                const numeric = Number(event.target.value)
                if (Number.isNaN(numeric)) {
                  return
                }
                setIdeasPerPillar(Math.min(5, Math.max(3, numeric)))
              }}
            />
          </div>
          <Button type="button" onClick={runGenerateIdeas} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Genererer idéer...
              </>
            ) : (
              "Generér idéer"
            )}
          </Button>
        </CardContent>
      </Card>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Kunne ikke generere idéer</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <div className="space-y-4">
          {result.pillarIdeas.map((pillar) => (
            <Card key={pillar.pillarTitle}>
              <CardHeader>
                <CardTitle className="text-base">{pillar.pillarTitle}</CardTitle>
                <CardDescription>
                  {pillar.ideas.length} idéer · genereret {new Date(result.generatedAt).toLocaleString("da-DK")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pillar.ideas.map((idea, index) => (
                  <div key={`${idea.title}-${index}`} className="rounded-md border p-3 text-sm space-y-1">
                    <p className="font-semibold">{idea.title}</p>
                    <p className="text-muted-foreground">
                      Platform: <span className="capitalize">{idea.suggestedPlatform}</span>
                    </p>
                    <p>
                      <span className="font-medium">Vinkel:</span> {idea.angle}
                    </p>
                    <p>
                      <span className="font-medium">Hook:</span> {idea.hook}
                    </p>
                    <p className="text-muted-foreground">{idea.rationale}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
