import { PROVIDERS } from '@/lib/ai/providers';
import type { ProviderId, ProviderType } from '@/lib/types/provider';
import { teacherProviderRequestBaseUrl } from './provider-endpoint';

export interface ProviderProbeInput {
  providerId: string;
  modelId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface ProviderProbeResult {
  ok: boolean;
  message: string;
  /** The provider has no connection check this server can run. */
  unsupported?: boolean;
}

const PROBE_TIMEOUT_MS = 20_000;

function providerType(providerId: string): ProviderType | undefined {
  return PROVIDERS[providerId as ProviderId]?.type;
}

async function readOk(response: Response): Promise<boolean> {
  if (response.status < 200 || response.status >= 300) return false;
  const text = await response.text();
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (body.error) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Short connection check for a teacher-supplied key.
 * The key is sent only to the provider endpoint and is never included in the result.
 */
export async function probeTeacherProvider(
  input: ProviderProbeInput,
): Promise<ProviderProbeResult> {
  const type = providerType(input.providerId);
  if (!type || type === 'bedrock' || type === 'azure') {
    return {
      ok: false,
      unsupported: true,
      message: 'This provider does not have a connection test in the teacher workspace.',
    };
  }

  let baseUrl: string;
  try {
    baseUrl = teacherProviderRequestBaseUrl(input.providerId);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Provider endpoint is not configured.',
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);

  try {
    const response = await dispatchProbe(type, baseUrl, input, fetchImpl, timeout);
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, message: 'The provider redirected the connection check.' };
    }
    const ok = await readOk(response);
    return ok
      ? { ok: true, message: 'Connection successful.' }
      : { ok: false, message: `The provider rejected the connection check (${response.status}).` };
  } catch {
    return { ok: false, message: 'Could not reach the provider.' };
  }
}

function dispatchProbe(
  type: ProviderType,
  baseUrl: string,
  input: ProviderProbeInput,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  if (type === 'anthropic') {
    return fetchImpl(`${baseUrl}/messages`, {
      method: 'POST',
      redirect: 'manual',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.modelId,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Say OK' }],
      }),
    });
  }

  if (type === 'google') {
    const url = new URL(`${baseUrl}/models/${encodeURIComponent(input.modelId)}:generateContent`);
    url.searchParams.set('key', input.apiKey);
    return fetchImpl(url, {
      method: 'POST',
      redirect: 'manual',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Say OK' }] }] }),
    });
  }

  return fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    redirect: 'manual',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.modelId,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Say OK' }],
    }),
  });
}
