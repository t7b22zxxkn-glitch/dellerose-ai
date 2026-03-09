import "server-only"

import type { Platform } from "@/lib/types/domain"

type PublishConnectorInput = {
  platform: Platform
  publishMode: "api" | "manual_copy"
  postStatus: "draft" | "approved" | "scheduled" | "posted"
}

type PublishConnectorResult =
  | {
      outcome: "success"
    }
  | {
      outcome: "deferred"
      message: string
      delayMs: number
    }
  | {
      outcome: "retryable_error" | "fatal_error"
      message: string
    }

const MANUAL_RECHECK_DELAY_MS = 6 * 60 * 60 * 1000

export async function runPublishConnector(
  input: PublishConnectorInput
): Promise<PublishConnectorResult> {
  if (input.publishMode === "manual_copy") {
    if (input.postStatus === "posted") {
      return { outcome: "success" }
    }

    return {
      outcome: "deferred",
      message: "Afventer manuel posting. Brug manual-copy fallback eller marker posted.",
      delayMs: MANUAL_RECHECK_DELAY_MS,
    }
  }

  return {
    outcome: "fatal_error",
    message: `API connector mangler for platform "${input.platform}".`,
  }
}
