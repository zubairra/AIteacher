import { APICallError, RetryError } from 'ai';
import { apiError } from '@/lib/server/api-response';

const HTTP_ERROR_MIN = 400;
const HTTP_ERROR_MAX = 599;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toHttpErrorStatus(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isInteger(parsed) && parsed >= HTTP_ERROR_MIN && parsed <= HTTP_ERROR_MAX
    ? parsed
    : undefined;
}

function statusFromError(error: unknown, seen = new Set<unknown>()): number | undefined {
  if (!error || seen.has(error)) return undefined;
  seen.add(error);

  if (APICallError.isInstance(error)) {
    return toHttpErrorStatus(error.statusCode);
  }

  if (RetryError.isInstance(error)) {
    return (
      statusFromError(error.lastError, seen) ??
      error.errors
        .map((nested) => statusFromError(nested, seen))
        .find((status): status is number => status !== undefined)
    );
  }

  if (!isRecord(error)) return undefined;

  const status = toHttpErrorStatus(error.statusCode ?? error.status ?? error.status_code);
  if (status !== undefined) return status;

  return statusFromError(error.cause, seen) ?? statusFromError(error.lastError, seen);
}

export type NormalizedLlmErrorCode =
  | 'INVALID_API_KEY'
  | 'PROVIDER_QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'MODEL_UNAVAILABLE'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'STRUCTURED_OUTPUT_INVALID'
  | 'SAFETY_REFUSAL'
  | 'PROVIDER_UNREACHABLE'
  | 'UPSTREAM_ERROR';

export interface NormalizedLlmError {
  code: NormalizedLlmErrorCode;
  message: string;
  status?: number;
  retryable: boolean;
}

function errorText(error: unknown, seen = new Set<unknown>()): string {
  if (!error || seen.has(error)) return '';
  seen.add(error);
  if (error instanceof Error) {
    return `${error.name} ${error.message} ${errorText(error.cause, seen)}`.toLowerCase();
  }
  if (!isRecord(error)) return String(error).toLowerCase();
  return `${String(error.name ?? '')} ${String(error.message ?? '')} ${errorText(error.cause, seen)} ${errorText(error.lastError, seen)}`.toLowerCase();
}

/** Convert SDK/provider failures into stable, secret-free teacher-facing categories. */
export function normalizeLlmError(error: unknown): NormalizedLlmError {
  const status = statusFromError(error);
  const text = errorText(error);

  if (
    status === 401 ||
    status === 403 ||
    /incorrect api key|invalid api key|authentication/.test(text)
  ) {
    return { code: 'INVALID_API_KEY', message: 'API key is invalid.', status, retryable: false };
  }
  if (/quota|billing|insufficient[_ -]?funds|credit balance/.test(text)) {
    return {
      code: 'PROVIDER_QUOTA_EXCEEDED',
      message: 'Provider quota or billing limit exceeded.',
      status,
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      message: 'Provider rate limit reached. Please try again shortly.',
      status,
      retryable: true,
    };
  }
  if (
    status === 404 ||
    /model.+(not found|unavailable|does not exist)|unsupported model/.test(text)
  ) {
    return {
      code: 'MODEL_UNAVAILABLE',
      message: 'Selected model is unavailable.',
      status,
      retryable: false,
    };
  }
  if (/noobjectgenerated|structured output|schema validation|invalid json/.test(text)) {
    return {
      code: 'STRUCTURED_OUTPUT_INVALID',
      message: 'Provider returned invalid structured output.',
      status,
      retryable: false,
    };
  }
  if (/content filter|safety|\brefusal\b|request was refused/.test(text)) {
    return {
      code: 'SAFETY_REFUSAL',
      message: 'Provider declined this request because of its safety policy.',
      status,
      retryable: false,
    };
  }
  if (/json|parse|unexpected response|invalid response/.test(text)) {
    return {
      code: 'PROVIDER_INVALID_RESPONSE',
      message: 'Provider returned an invalid response.',
      status,
      retryable: false,
    };
  }
  if (
    status === undefined &&
    /enotfound|econnrefused|econnreset|network|fetch failed|timeout|timed out/.test(text)
  ) {
    return {
      code: 'PROVIDER_UNREACHABLE',
      message: 'Unable to contact AI provider.',
      retryable: true,
    };
  }
  if (status !== undefined && status >= 500) {
    return {
      code: 'PROVIDER_UNREACHABLE',
      message: 'AI provider is temporarily unavailable.',
      status,
      retryable: true,
    };
  }
  return {
    code: 'UPSTREAM_ERROR',
    message: 'AI provider rejected the request.',
    status,
    retryable: false,
  };
}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) {
    return 'Upstream authentication or authorization failed.';
  }
  if (status === 404) return 'Upstream endpoint not found.';
  if (status === 429) return 'Upstream rate limit reached. Please try again shortly.';
  if (status >= 500) return 'Upstream model provider is temporarily unavailable. Please try again.';
  return 'Upstream provider rejected the request.';
}

/**
 * Preserve a provider's HTTP semantics for client retry classification without
 * exposing provider response bodies, URLs, or credential-adjacent details.
 */
export function llmApiError(error: unknown) {
  const normalized = normalizeLlmError(error);
  const status = normalized.status;
  if (status === undefined) {
    return apiError('INTERNAL_ERROR', 500, 'Scene generation failed. Please try again.');
  }

  return apiError(
    normalized.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'UPSTREAM_ERROR',
    status,
    normalized.message || messageForStatus(status),
  );
}
