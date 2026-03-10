export type ActionErrorCode =
  | "invalid_input"
  | "missing_dependency"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_failed"
  | "database_error"
  | "external_service_error"
  | "internal_error"

export type ActionFailure = {
  success: false
  code: ActionErrorCode
  message: string
  retryable: boolean
  requestId: string
}

export type ActionSuccess<TPayload extends Record<string, unknown>> = {
  success: true
  requestId: string
} & TPayload

export type ActionResult<TPayload extends Record<string, unknown>> =
  | ActionSuccess<TPayload>
  | ActionFailure

type CreateActionFailureInput = {
  code: ActionErrorCode
  message: string
  retryable: boolean
  requestId: string
}

export function createActionFailure(input: CreateActionFailureInput): ActionFailure {
  return {
    success: false,
    code: input.code,
    message: input.message,
    retryable: input.retryable,
    requestId: input.requestId,
  }
}

export function createActionSuccess<TPayload extends Record<string, unknown>>(
  requestId: string,
  payload: TPayload
): ActionSuccess<TPayload> {
  return {
    success: true,
    requestId,
    ...payload,
  }
}

type ActionFailureLike = {
  success: false
  message: string
  requestId?: string | null
}

export function formatActionErrorMessage(
  failure: ActionFailureLike,
  options?: {
    includeRequestId?: boolean
  }
): string {
  const includeRequestId = options?.includeRequestId ?? true
  if (!includeRequestId || !failure.requestId) {
    return failure.message
  }

  return `${failure.message} (Ref: ${failure.requestId})`
}
