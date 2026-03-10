import { NextResponse } from "next/server"
import { z } from "zod"

import { runPublishWorker } from "@/features/scheduler/worker"

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  dryRun: z
    .string()
    .optional()
    .transform((value) => value === "true"),
})

function isAuthorized(request: Request): boolean {
  const workerKey = process.env.SCHEDULER_WORKER_KEY
  const cronSecret = process.env.CRON_SECRET

  const providedWorkerKey = request.headers.get("x-worker-key")
  const authorizationHeader = request.headers.get("authorization")
  const providedBearerToken = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : null

  if (workerKey && providedWorkerKey === workerKey) {
    return true
  }

  if (cronSecret && providedBearerToken === cronSecret) {
    return true
  }

  if (!workerKey && !cronSecret && process.env.NODE_ENV !== "production") {
    return true
  }

  return false
}

async function handleWorkerRequest(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized publish worker request.",
      },
      { status: 401 }
    )
  }

  const url = new URL(request.url)
  const parsedQuery = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    dryRun: url.searchParams.get("dryRun") ?? undefined,
  })

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Worker query params er ugyldige.",
      },
      { status: 400 }
    )
  }

  const result = await runPublishWorker({
    limit: parsedQuery.data.limit,
    dryRun: parsedQuery.data.dryRun,
  })

  if (!result.success) {
    return NextResponse.json(
      {
        ok: false,
        error: result.message,
        requestId: result.requestId,
        summary: result,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    requestId: result.requestId,
    summary: result,
  })
}

export async function GET(request: Request) {
  return handleWorkerRequest(request)
}

export async function POST(request: Request) {
  return handleWorkerRequest(request)
}
