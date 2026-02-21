"use client"

import { useActionState, useState } from "react"
import { AlertCircle, CheckCircle2, LockKeyhole } from "lucide-react"

import { submitAuthAction } from "@/features/auth/actions"
import { authInitialState } from "@/features/auth/types"

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

type AuthMode = "sign-in" | "sign-up"

type AuthPanelProps = {
  nextPath: string
}

export function AuthPanel({ nextPath }: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>("sign-in")
  const [state, formAction, isPending] = useActionState(
    submitAuthAction,
    authInitialState
  )

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockKeyhole className="h-5 w-5" />
          {mode === "sign-in" ? "Log ind" : "Opret konto"}
        </CardTitle>
        <CardDescription>
          {mode === "sign-in"
            ? "Log ind for at gemme profiles, drafts og scheduler-data."
            : "Opret en konto i Supabase Auth for at fortsætte."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.status !== "idle" ? (
          <Alert variant={state.status === "error" ? "destructive" : "default"}>
            {state.status === "error" ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <AlertTitle>
              {state.status === "error" ? "Kunne ikke fortsætte" : "Succes"}
            </AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="nextPath" value={nextPath} />

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="dig@firma.dk"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              placeholder="Mindst 8 tegn"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending
              ? "Arbejder..."
              : mode === "sign-in"
                ? "Log ind"
                : "Opret konto"}
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() =>
            setMode((previous) => (previous === "sign-in" ? "sign-up" : "sign-in"))
          }
        >
          {mode === "sign-in"
            ? "Har du ikke en konto? Opret en her"
            : "Har du allerede en konto? Log ind"}
        </Button>
      </CardContent>
    </Card>
  )
}
