type LogLevel = "info" | "warn" | "error"

const SECRET_FIELD_PATTERN =
  /(api[-_]?key|token|secret|password|authorization|cookie|set-cookie)/i
const MAX_METADATA_DEPTH = 4
const MAX_METADATA_ARRAY_ITEMS = 25

export type TokenUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
} | null

export type ActionLogEvent = {
  requestId: string
  actionName: string
  message: string
  correlationId?: string | null
  userId?: string | null
  workflowId?: string | null
  platform?: string | null
  model?: string | null
  latencyMs?: number | null
  tokenUsage?: TokenUsage
  errorCode?: string | null
  errorType?: string | null
  metadata?: Record<string, unknown>
}

type StructuredLogPayload = {
  timestamp: string
  level: LogLevel
  request_id: string
  correlation_id: string
  action_name: string
  message: string
  user_id: string | null
  workflow_id: string | null
  platform: string | null
  model: string | null
  latency_ms: number | null
  token_usage: {
    prompt_tokens: number | null
    completion_tokens: number | null
    total_tokens: number | null
  } | null
  error_code: string | null
  error_type: string | null
  metadata: Record<string, unknown> | null
}

function randomHex(length: number): string {
  const alphabet = "0123456789abcdef"
  let output = ""

  for (let index = 0; index < length; index += 1) {
    const random = Math.floor(Math.random() * alphabet.length)
    output += alphabet[random] ?? "0"
  }

  return output
}

export function createRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) {
    return uuid
  }

  return `req_${Date.now()}_${randomHex(10)}`
}

function resolveCorrelationId(event: ActionLogEvent): string {
  const explicit = event.correlationId?.trim()
  if (explicit) {
    return explicit
  }

  const workflowBased = event.workflowId?.trim()
  if (workflowBased) {
    return workflowBased
  }

  return event.requestId
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (value === null) {
    return null
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (depth >= MAX_METADATA_DEPTH) {
    return "[TRUNCATED]"
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ARRAY_ITEMS)
      .map((item) => sanitizeMetadataValue(item, depth + 1))
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>
    const sanitized: Record<string, unknown> = {}

    for (const [key, nestedValue] of Object.entries(source)) {
      if (SECRET_FIELD_PATTERN.test(key)) {
        sanitized[key] = "[REDACTED]"
        continue
      }
      sanitized[key] = sanitizeMetadataValue(nestedValue, depth + 1)
    }

    return sanitized
  }

  return String(value)
}

function normalizeTokenUsage(tokenUsage: TokenUsage | undefined): StructuredLogPayload["token_usage"] {
  if (!tokenUsage) {
    return null
  }

  return {
    prompt_tokens: tokenUsage.promptTokens ?? null,
    completion_tokens: tokenUsage.completionTokens ?? null,
    total_tokens: tokenUsage.totalTokens ?? null,
  }
}

function toStructuredPayload(level: LogLevel, event: ActionLogEvent): StructuredLogPayload {
  return {
    timestamp: new Date().toISOString(),
    level,
    request_id: event.requestId,
    correlation_id: resolveCorrelationId(event),
    action_name: event.actionName,
    message: event.message,
    user_id: event.userId ?? null,
    workflow_id: event.workflowId ?? null,
    platform: event.platform ?? null,
    model: event.model ?? null,
    latency_ms: event.latencyMs ?? null,
    token_usage: normalizeTokenUsage(event.tokenUsage),
    error_code: event.errorCode ?? null,
    error_type: event.errorType ?? null,
    metadata: event.metadata
      ? (sanitizeMetadataValue(event.metadata) as Record<string, unknown>)
      : null,
  }
}

function emitStructuredLog(level: LogLevel, event: ActionLogEvent): void {
  const payload = toStructuredPayload(level, event)
  const serialized = JSON.stringify(payload)

  if (level === "error") {
    console.error(serialized)
    return
  }

  if (level === "warn") {
    console.warn(serialized)
    return
  }

  console.info(serialized)
}

export function logActionInfo(event: ActionLogEvent): void {
  emitStructuredLog("info", event)
}

export function logActionWarn(event: ActionLogEvent): void {
  emitStructuredLog("warn", event)
}

export function logActionError(event: ActionLogEvent): void {
  emitStructuredLog("error", event)
}
