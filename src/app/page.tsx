import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <section className="w-full max-w-2xl rounded-2xl border bg-background p-8 shadow-sm">
        <div className="mb-6 inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm">
          <Sparkles className="h-4 w-4" />
          DelleRose.ai · One Idea. Every Platform.
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">
          Multi-agent social orchestration platform
        </h1>
        <p className="text-muted-foreground mt-4 leading-relaxed">
          MVP v1 starter er sat op med Next.js App Router, Supabase og strict
          type-sikring. Start med onboarding for at oprette din Brand Profile.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/onboarding">
              Gå til onboarding
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/brain-dump">
              Åbn Brain Dump
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
