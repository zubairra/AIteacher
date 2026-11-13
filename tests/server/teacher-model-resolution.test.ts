import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getModelCalls: [] as Array<Record<string, unknown>>,
  credential: null as null | { providerId: string; modelId: string; apiKey: string },
}));

vi.mock('@/lib/ai/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/providers')>();
  return {
    ...actual,
    getModel: (args: Record<string, unknown>) => {
      mocks.getModelCalls.push(args);
      return { model: { id: args.modelId }, modelInfo: undefined };
    },
  };
});

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: async () => null,
}));

vi.mock('@/lib/server/auth/credential-vault', () => ({
  resolveTeacherProviderCredential: async () => mocks.credential,
}));

const OWNER_KEY = 'sk-or-owner-secret';
const TEACHER_KEY = 'sk-or-teacher-secret';
const GATEWAY = 'https://gateway.example/v1';

describe('signed-in teacher model resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getModelCalls.length = 0;
    mocks.credential = null;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.OPENROUTER_MODELS;
    delete process.env.MODEL_ROUTES;
    delete process.env.DEFAULT_MODEL;
    delete process.env.DASHSCOPE_BASE_URL;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  it('sends a saved OpenRouter model to OpenRouter with the teacher key', async () => {
    process.env.OPENROUTER_API_KEY = OWNER_KEY;
    process.env.OPENROUTER_BASE_URL = GATEWAY;
    mocks.credential = {
      providerId: 'openrouter',
      modelId: 'deepseek/deepseek-v4-pro',
      apiKey: TEACHER_KEY,
    };
    const { resolveSignedInTeacherModel } = await import('@/lib/server/resolve-model');
    const resolved = await resolveSignedInTeacherModel('teacher-1');

    expect(resolved.providerId).toBe('openrouter');
    expect(resolved.modelId).toBe('deepseek/deepseek-v4-pro');
    expect(resolved.modelString).toBe('openrouter:deepseek/deepseek-v4-pro');
    expect(resolved.apiKey).toBe(TEACHER_KEY);
    expect(mocks.getModelCalls[0]).toMatchObject({
      providerId: 'openrouter',
      modelId: 'deepseek/deepseek-v4-pro',
      apiKey: TEACHER_KEY,
      baseUrl: 'https://openrouter.ai/api/v1',
    });
    expect(mocks.getModelCalls[0]?.apiKey).not.toBe(OWNER_KEY);
  });

  it('sends a saved Qwen key to an operator DashScope override', async () => {
    process.env.DASHSCOPE_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    mocks.credential = {
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      apiKey: 'sk-fake-qwen-test-A92F',
    };
    const { resolveSignedInTeacherModel } = await import('@/lib/server/resolve-model');
    const resolved = await resolveSignedInTeacherModel('teacher-1');
    expect(resolved.providerId).toBe('qwen');
    expect(resolved.apiKey).toBe('sk-fake-qwen-test-A92F');
    expect(mocks.getModelCalls[0]).toMatchObject({
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    });
  });

  it('falls back to the server OpenRouter key when the teacher has not saved one', async () => {
    process.env.OPENROUTER_API_KEY = OWNER_KEY;
    process.env.OPENROUTER_BASE_URL = GATEWAY;
    process.env.OPENROUTER_MODELS = 'deepseek/deepseek-v4-flash';
    const { resolveSignedInTeacherModel } = await import('@/lib/server/resolve-model');
    const { getServerProviders } = await import('@/lib/server/provider-config');
    const resolved = await resolveSignedInTeacherModel('teacher-1');

    expect(resolved.modelString).toBe('openrouter:deepseek/deepseek-v4-flash');
    expect(resolved.providerId).toBe('openrouter');
    expect(resolved.apiKey).toBe(OWNER_KEY);
    expect(mocks.getModelCalls[0]).toMatchObject({
      providerId: 'openrouter',
      modelId: 'deepseek/deepseek-v4-flash',
      apiKey: OWNER_KEY,
      baseUrl: GATEWAY,
    });
    expect(JSON.stringify(getServerProviders())).not.toContain(OWNER_KEY);
  });

  it('asks for a key instead of spending nothing when neither key exists', async () => {
    const { resolveSignedInTeacherModel } = await import('@/lib/server/resolve-model');
    const { ProviderSetupError } = await import('@/lib/server/provider-setup-error');
    const { generationSetupResponse } = await import('@/lib/server/auth/generation-access');

    await expect(resolveSignedInTeacherModel('teacher-1')).rejects.toBeInstanceOf(
      ProviderSetupError,
    );
    try {
      await resolveSignedInTeacherModel('teacher-1');
    } catch (error) {
      const response = generationSetupResponse(error);
      expect(response?.status).toBe(400);
      const body = await response!.json();
      expect(body).toMatchObject({
        success: false,
        errorCode: 'AI_PROVIDER_SETUP_REQUIRED',
        error: 'Add an API key in Settings, or set OPENROUTER_API_KEY on the server.',
      });
    }
  });

  it('does not attach the managed server key for an anonymous resolve', async () => {
    process.env.OPENROUTER_API_KEY = OWNER_KEY;
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const resolved = await resolveModel({
      modelString: 'openrouter:deepseek/deepseek-v4-pro',
      apiKey: 'caller-key',
      allowManagedServerKey: false,
    });
    expect(resolved.apiKey).toBe('caller-key');
    expect(resolved.apiKey).not.toBe(OWNER_KEY);

    mocks.getModelCalls.length = 0;
    const blocked = await resolveModel({
      modelString: 'openrouter:deepseek/deepseek-v4-pro',
      allowManagedServerKey: false,
    });
    expect(blocked.apiKey).toBe('');
  });
});
