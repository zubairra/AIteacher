import { afterEach, describe, expect, test } from 'vitest';

import { serverProviderBaseUrlOverride } from '@/lib/server/auth/provider-endpoint';
import { probeTeacherProvider } from '@/lib/server/auth/provider-probe';

const ENV_KEYS = [
  'DASHSCOPE_BASE_URL',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'ALLOW_LOCAL_NETWORKS',
] as const;

describe('teacher provider connection checks', () => {
  const previous = new Map<string, string | undefined>();

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (!previous.has(key)) continue;
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
  });

  function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
    if (!previous.has(key)) previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  test('rejects a local DashScope override outside the emulator', () => {
    setEnv('DASHSCOPE_BASE_URL', 'http://127.0.0.1:8787/v1');
    setEnv('FIREBASE_AUTH_EMULATOR_HOST', undefined);
    setEnv('FIRESTORE_EMULATOR_HOST', undefined);
    setEnv('ALLOW_LOCAL_NETWORKS', undefined);
    expect(() => serverProviderBaseUrlOverride('qwen')).toThrow(/local address/);
  });

  test('accepts the international DashScope host', () => {
    setEnv('DASHSCOPE_BASE_URL', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/');
    expect(serverProviderBaseUrlOverride('qwen')).toBe(
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    );
  });

  test('probes Qwen without returning the key', async () => {
    setEnv('DASHSCOPE_BASE_URL', 'https://dashscope.example/compatible-mode/v1');
    const secret = 'sk-fake-qwen-test-A92F';
    let seenAuthorization = '';
    const fetchImpl: typeof fetch = async (_input, init) => {
      seenAuthorization = new Headers(init?.headers).get('authorization') || '';
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await probeTeacherProvider({
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      apiKey: secret,
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, message: 'Connection successful.' });
    expect(seenAuthorization).toBe(`Bearer ${secret}`);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  test('reports a rejected provider without echoing the response body', async () => {
    setEnv('DASHSCOPE_BASE_URL', 'https://dashscope.example/compatible-mode/v1');
    const secret = 'sk-fake-qwen-test-A92F';
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: `bad key ${secret}` } }), { status: 401 });

    const result = await probeTeacherProvider({
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      apiKey: secret,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.message).toContain('401');
  });
});
