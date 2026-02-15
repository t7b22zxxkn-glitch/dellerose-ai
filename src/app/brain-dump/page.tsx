import { Mic } from "lucide-react"

import { BrainDumpStudio } from "@/features/brain-dump/components/brain-dump-studio"

export default function BrainDumpPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <section className="mx-auto mb-8 max-w-4xl space-y-3">
        <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-sm">
          <Mic className="h-4 w-4" />
          Modul 1 · Brain Dump
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Voice input og transskription
        </h1>
        <p className="text-muted-foreground">
          Tal én rå idé. DelleRose.ai transskriberer lyd med Whisper og
          strukturerer derefter inputtet via Master Agenten.
        </p>
      </section>

      <BrainDumpStudio />
    </main>
  )
}
