"use client"

import { useEffect } from "react"

import { useWorkflowStore } from "@/features/workflow/store"
import type { PersistedWorkflowSnapshot } from "@/features/workflow/types"

type WorkflowHydratorProps = {
  snapshot: PersistedWorkflowSnapshot | null
}

export function WorkflowHydrator({ snapshot }: WorkflowHydratorProps) {
  const hydrateFromPersistedSnapshot = useWorkflowStore(
    (state) => state.hydrateFromPersistedSnapshot
  )

  useEffect(() => {
    if (!snapshot) {
      return
    }

    hydrateFromPersistedSnapshot(snapshot)
  }, [hydrateFromPersistedSnapshot, snapshot])

  return null
}
