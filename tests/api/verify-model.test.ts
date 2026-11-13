import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  callLLM: vi.fn(),
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: mocks.resolveModel,
}));

vi.mock('@/lib/ai/llm', () => ({
  callLLM: mocks.callLLM,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

async function postVerifyModel(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/verify-model/route');
  const request = new Request('http://localhost/api/verify-model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request as unknown as NextRequest);
}

describe('POST /api/verify-model', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.resolveModel.mockReset();
    mocks.callLLM.mockReset();
    mocks.resolveModel.mockResolvedValue({ model: { id: 'language-model' } });
    mocks.callLLM.mockResolvedValue({ text: 'OK' });
  });

  it('rejects requests without a model name', async () => {
    const res = await postVerifyModel({});
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      errorCode: 'MISSING_REQUIRED_FIELD',
    });
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('uses the unified LLM wrapper with thinking disabled for connection checks', async () => {
    const res = await postVerifyModel({
      model: 'xiaomi:mimo-v2.5-pro',
      apiKey: 'tp-test',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      providerType: 'openai',
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      message: 'Connection successful',
      response: 'OK',
    });
    expect(mocks.resolveModel).toHaveBeenCalledWith({
      modelString: 'xiaomi:mimo-v2.5-pro',
      apiKey: 'tp-test',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      providerType: 'openai',
      allowManagedServerKey: false,
    });
    expect(mocks.callLLM).toHaveBeenCalledWith(
      {
        model: { id: 'language-model' },
        prompt: 'Say "OK" if you can hear me.',
        maxOutputTokens: 64,
      },
      'verify-model',
      undefined,
      { mode: 'disabled', enabled: false },
    );
  });

  it.each([
    [401, 'Incorrect API key provided', 401, 'API key is invalid.'],
    [429, 'insufficient quota', 429, 'Provider quota or billing limit exceeded.'],
    [404, 'model does not exist', 404, 'Selected model is unavailable.'],
    [502, 'invalid response JSON', 502, 'Provider returned an invalid response.'],
  ])(
    'returns a safe normalized provider failure for status %i',
    async (statusCode, message, expectedStatus, expectedMessage) => {
      mocks.callLLM.mockRejectedValue(Object.assign(new Error(message), { statusCode }));
      const response = await postVerifyModel({
        model: 'qwen:qwen3.7-plus',
        apiKey: 'not-a-real-key',
      });
      const json = await response.json();
      expect(response.status).toBe(expectedStatus);
      expect(json.error).toBe(expectedMessage);
      expect(JSON.stringify(json)).not.toContain('not-a-real-key');
    },
  );
});
