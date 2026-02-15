"use client"

import { useActionState, useState } from "react"
import { AlertCircle, CheckCircle2, Save, SlidersHorizontal } from "lucide-react"

import { submitBrandProfileAction } from "@/features/onboarding/actions"
import { onboardingInitialState } from "@/features/onboarding/types"
import type { BrandProfile } from "@/lib/types/domain"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"

type OnboardingFormProps = {
  initialProfile: BrandProfile | null
  canSubmit: boolean
  notice: string | null
}

type SliderFieldProps = {
  id: "toneLevel" | "lengthPreference" | "opinionLevel"
  label: string
  description: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  error?: string
}

function SliderField({
  id,
  label,
  description,
  min,
  max,
  value,
  onChange,
  error,
}: SliderFieldProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-muted-foreground text-sm">{value}</span>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={(nextValue) => onChange(nextValue[0] ?? value)}
      />
      <input type="hidden" name={id} value={value} />
      <p className="text-muted-foreground text-sm">{description}</p>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  )
}

export function OnboardingForm({
  initialProfile,
  canSubmit,
  notice,
}: OnboardingFormProps) {
  const [state, formAction, isPending] = useActionState(
    submitBrandProfileAction,
    onboardingInitialState
  )

  const [toneLevel, setToneLevel] = useState(initialProfile?.toneLevel ?? 5)
  const [lengthPreference, setLengthPreference] = useState(
    initialProfile?.lengthPreference ?? 3
  )
  const [opinionLevel, setOpinionLevel] = useState(
    initialProfile?.opinionLevel ?? 5
  )
  const [preferredWords, setPreferredWords] = useState(
    initialProfile?.preferredWords.join(", ") ?? ""
  )
  const [bannedWords, setBannedWords] = useState(
    initialProfile?.bannedWords.join(", ") ?? ""
  )
  const [voiceSample, setVoiceSample] = useState(initialProfile?.voiceSample ?? "")

  const showFormMessage = state.status !== "idle" && state.message.length > 0

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" />
          Brand Profile Onboarding
        </CardTitle>
        <CardDescription>
          Definer tone, længde og ordvalg. Denne profil bruges af alle agenter i
          DelleRose.ai.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {notice ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Bemærk</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        {showFormMessage ? (
          <Alert variant={state.status === "error" ? "destructive" : "default"}>
            {state.status === "error" ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <AlertTitle>
              {state.status === "error" ? "Kunne ikke gemme" : "Gemt"}
            </AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-6">
          <fieldset
            className="space-y-6"
            disabled={!canSubmit || isPending}
            aria-busy={isPending}
          >
            <SliderField
              id="toneLevel"
              label="Tone Level (1-10)"
              description="1 = formel/kold, 10 = casual/slang."
              min={1}
              max={10}
              value={toneLevel}
              onChange={setToneLevel}
              error={state.fieldErrors.toneLevel}
            />

            <SliderField
              id="lengthPreference"
              label="Length Preference (1-5)"
              description="1 = kort/punchy, 5 = langt/dybdegående."
              min={1}
              max={5}
              value={lengthPreference}
              onChange={setLengthPreference}
              error={state.fieldErrors.lengthPreference}
            />

            <SliderField
              id="opinionLevel"
              label="Opinion Level (1-10)"
              description="1 = neutral/fakta, 10 = provokerende/holdning."
              min={1}
              max={10}
              value={opinionLevel}
              onChange={setOpinionLevel}
              error={state.fieldErrors.opinionLevel}
            />

            <div className="space-y-2">
              <Label htmlFor="preferredWords">
                Preferred words (kommasepareret)
              </Label>
              <Textarea
                id="preferredWords"
                name="preferredWords"
                value={preferredWords}
                onChange={(event) => setPreferredWords(event.target.value)}
                placeholder="f.eks. gennemslagskraft, tillid, momentum"
              />
              {state.fieldErrors.preferredWords ? (
                <p className="text-destructive text-sm">
                  {state.fieldErrors.preferredWords}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bannedWords">
                Banned words (kommasepareret)
              </Label>
              <Textarea
                id="bannedWords"
                name="bannedWords"
                value={bannedWords}
                onChange={(event) => setBannedWords(event.target.value)}
                placeholder="f.eks. billig, garanteret, clickbait"
              />
              {state.fieldErrors.bannedWords ? (
                <p className="text-destructive text-sm">
                  {state.fieldErrors.bannedWords}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="voiceSample">Voice sample URL (valgfri)</Label>
              <Input
                id="voiceSample"
                name="voiceSample"
                type="url"
                value={voiceSample}
                onChange={(event) => setVoiceSample(event.target.value)}
                placeholder="https://..."
              />
              {state.fieldErrors.voiceSample ? (
                <p className="text-destructive text-sm">
                  {state.fieldErrors.voiceSample}
                </p>
              ) : null}
            </div>
          </fieldset>

          <CardFooter className="px-0 pt-2">
            <Button type="submit" disabled={!canSubmit || isPending}>
              <Save className="h-4 w-4" />
              {isPending ? "Gemmer..." : "Gem brand profile"}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  )
}
