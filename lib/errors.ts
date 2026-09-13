import type { ApiErrorBody } from "@/types/contracts";

/** Error code → HTTP status. The code is the contract; the message is for humans. */
export const ERROR_STATUS = {
  malformed_input: 400,
  unsupported_operation: 400,
  unauthenticated: 401,
  demo_restricted: 403,
  origin_mismatch: 403,
  not_linked: 403,
  oauth_state_invalid: 403,
  not_found: 404,
  stale_proposal: 409,
  stale_context: 409,
  version_conflict: 409,
  turn_in_progress: 409,
  already_processing: 409,
  expired_proposal: 410,
  payload_too_large: 413,
  rate_limited: 429,
  internal_error: 500,
  provider_error: 502,
  provider_unavailable: 503,
  deadline_exceeded: 504,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const RETRYABLE_DEFAULT: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "rate_limited",
  "provider_error",
  "provider_unavailable",
  "deadline_exceeded",
  "turn_in_progress",
  "already_processing",
]);

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.retryable = options.retryable ?? RETRYABLE_DEFAULT.has(code);
    this.details = options.details;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Convert anything thrown into an ApiError without leaking internals. */
export function toApiError(value: unknown): ApiError {
  if (isApiError(value)) return value;
  if (value instanceof Error && value.name === "AbortError") {
    return new ApiError("deadline_exceeded", "The request took too long.", { cause: value });
  }
  return new ApiError("internal_error", "Something went wrong.", { cause: value });
}

export function errorBody(error: ApiError, requestId: string): ApiErrorBody {
  return {
    error: { code: error.code, message: error.message, retryable: error.retryable },
    requestId,
  };
}
