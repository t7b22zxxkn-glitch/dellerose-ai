"use client"

import { useEffect } from "react"

import { useWorkflowStore } from "@/features/workflow/store"
import type { PersistedWorkflowSnapshot } from "@/features/workflow/types"

type WorkflowHydratorProps = {
  snapshot: PersistedWorkflowSnapshot | null
  forceHydrate?: boolean
}

export function WorkflowHydrator({
  snapshot,
  forceHydrate = false,
}: WorkflowHydratorProps) {
  const hydrateFromPersistedSnapshot = useWorkflowStore(
    (state) => state.hydrateFromPersistedSnapshot
  )

  useEffect(() => {
    if (!snapshot) {
      return
    }

    hydrateFromPersistedSnapshot(snapshot, { force: forceHydrate })
  }, [forceHydrate, hydrateFromPersistedSnapshot, snapshot])

  return null
}
