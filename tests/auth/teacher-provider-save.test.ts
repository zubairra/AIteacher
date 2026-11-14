import { beforeEach, describe, expect, test, vi } from 'vitest';

import { defaultTeacherModelId } from '@/lib/teacher/provider-defaults';
import { PROVIDERS } from '@/lib/ai/providers';

const documents = new Map<string, Record<string, unknown>>();

function reference(path: string) {
  return {
    path,
    async get() {
      const value = documents.get(path);
      return { exists: Boolean(value), data: () => value };
    },
    async set(value: Record<string, unknown>, options?: { merge?: boolean }) {
      documents.set(path, options?.merge ? { ...documents.get(path), ...value } : value);
    },
  };
}

const fakeDb = {
  doc: reference,
  collection(path: string) {
    return {
      doc: (id: string) => reference(`${path}/${id}`),
      async get() {
        const prefix = `${path}/`;
        return {
          docs: [...documents.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => ({ id: key.slice(prefix.length), data: () => value })),
        };
      },
    };
  },
  batch() {
    const writes: Array<() => void> = [];
    return {
      set(ref: { path: string }, value: Record<string, unknown>, options?: { merge?: boolean }) {
        writes.push(() =>
          documents.set(
            ref.path,
            options?.merge ? { ...documents.get(ref.path), ...value } : value,
          ),
        );
      },
      async commit() {
        writes.forEach((write) => write());
      },
    };
  },
};

vi.mock('@/lib/server/firebase/admin', () => ({ firebaseAdminDb: () => fakeDb }));
vi.mock('@/lib/server/auth/session', () => ({
  resolveTeacherSessionRequest: async () => ({
    id: 'teacher-a',
    name: 'Teacher A',
    email: 'teacher-a@example.test',
  }),
}));

const PROVIDERS_UNDER_TEST = ['deepseek', 'kimi', 'qwen', 'openrouter'] as const;

function saveRequest(body: unknown) {
  return new Request('http://127.0.0.1:3000/api/teacher/providers', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: '127.0.0.1:3000' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/teacher/providers', () => {
  beforeEach(() => {
    vi.resetModules();
    documents.clear();
    process.env.APP_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  });

  test('encrypts DeepSeek, Kimi, Qwen, and OpenRouter keys and stores their default models', async () => {
    const { POST, GET } = await import('@/app/api/teacher/providers/route');

    for (const providerId of PROVIDERS_UNDER_TEST) {
      const apiKey = `sk-live-${providerId}-secret-W91Z`;
      const response = await POST(saveRequest({ providerId, apiKey }));
      const text = await response.text();
      const body = JSON.parse(text) as { maskedSuffix?: string; configured?: boolean };

      expect(response.status, text).toBe(200);
      expect(body).toMatchObject({
        configured: true,
        maskedSuffix: 'W91Z',
        verificationStatus: 'unverified',
      });
      expect(text).not.toContain(apiKey);
      expect(text).not.toContain('ciphertext');

      const stored = documents.get(`users/teacher-a/providerCredentials/${providerId}`);
      expect(stored?.ciphertext).toEqual(expect.any(String));
      expect(JSON.stringify(stored)).not.toContain(apiKey);
      expect(documents.get('users/teacher-a/settings/ai')).toMatchObject({
        providerId,
        modelId: defaultTeacherModelId(providerId, PROVIDERS[providerId].models),
      });
    }

    const listed = await GET(new Request('http://127.0.0.1:3000/api/teacher/providers'));
    const catalogText = await listed.text();
    expect(catalogText).not.toContain('sk-live-');
    expect(catalogText).not.toContain('ciphertext');
    const catalog = JSON.parse(catalogText) as {
      providers: Array<{ id: string; models: Array<{ id: string; name: string }> }>;
      credentials: Array<{ providerId: string; maskedSuffix?: string; configured: boolean }>;
    };
    const deepseek = catalog.providers.find((provider) => provider.id === 'deepseek');
    expect(deepseek?.models.map((model) => model.name)).toEqual([
      'DeepSeek V4 Pro',
      'DeepSeek V4 Flash',
      'DeepSeek V4 Flash Vision (Exp)',
    ]);
    expect(catalog.credentials.find((item) => item.providerId === 'qwen')).toMatchObject({
      configured: true,
      maskedSuffix: 'W91Z',
    });
  });

  test('rejects a model that belongs to another provider', async () => {
    const { POST } = await import('@/app/api/teacher/providers/route');
    const response = await POST(
      saveRequest({
        providerId: 'deepseek',
        modelId: 'gemini-2.5-flash',
        apiKey: 'sk-live-deepseek-secret-W91Z',
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Select a supported model' });
    expect(documents.has('users/teacher-a/providerCredentials/deepseek')).toBe(false);
  });
});
