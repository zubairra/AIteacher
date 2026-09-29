import { describe, expect, it } from 'vitest';
import { normalizeLlmError } from '@/lib/server/llm-error-response';

function providerError(message: string, statusCode?: number) {
  return Object.assign(new Error(message), statusCode === undefined ? {} : { statusCode });
}

describe('LLM provider error normalization', () => {
  it.each([
    [providerError('Incorrect API key provided', 401), 'INVALID_API_KEY', 'API key is invalid.'],
    [
      providerError('insufficient quota for this account', 429),
      'PROVIDER_QUOTA_EXCEEDED',
      'Provider quota or billing limit exceeded.',
    ],
    [
      providerError('too many requests', 429),
      'RATE_LIMITED',
      'Provider rate limit reached. Please try again shortly.',
    ],
    [
      providerError('model does not exist', 404),
      'MODEL_UNAVAILABLE',
      'Selected model is unavailable.',
    ],
    [
      providerError('fetch failed: ECONNREFUSED'),
      'PROVIDER_UNREACHABLE',
      'Unable to contact AI provider.',
    ],
    [
      providerError('unexpected response JSON'),
      'PROVIDER_INVALID_RESPONSE',
      'Provider returned an invalid response.',
    ],
    [
      providerError('NoObjectGeneratedError: schema validation failed'),
      'STRUCTURED_OUTPUT_INVALID',
      'Provider returned invalid structured output.',
    ],
    [
      providerError('content filter safety refusal', 400),
      'SAFETY_REFUSAL',
      'Provider declined this request because of its safety policy.',
    ],
  ])('classifies %# without returning raw provider details', (error, code, message) => {
    expect(normalizeLlmError(error)).toMatchObject({ code, message });
  });

  it('keeps malformed unknown failures generic', () => {
    expect(normalizeLlmError({ strange: true })).toEqual({
      code: 'UPSTREAM_ERROR',
      message: 'AI provider rejected the request.',
      status: undefined,
      retryable: false,
    });
  });
});
