import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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

describe('Firestore provider credential vault', () => {
  beforeEach(() => {
    vi.resetModules();
    documents.clear();
    process.env.APP_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });
  afterEach(() => {
    delete process.env.APP_CREDENTIAL_ENCRYPTION_KEY;
  });

  test('stores ciphertext and returns only masked metadata', async () => {
    const vault = await import('@/lib/server/auth/credential-vault');
    await vault.saveTeacherProviderCredential({
      userId: 'teacher-a',
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      apiKey: 'secret-provider-key-A92F',
      verificationStatus: 'verified',
    });

    const stored = documents.get('users/teacher-a/providerCredentials/qwen')!;
    expect(stored.ciphertext).not.toContain('secret-provider-key-A92F');
    expect(JSON.stringify(stored)).not.toContain('secret-provider-key-A92F');
    const configured = (await vault.listTeacherProviderCredentials('teacher-a')).find(
      (item) => item.providerId === 'qwen',
    );
    expect(configured).toMatchObject({
      configured: true,
      maskedSuffix: 'A92F',
      verificationStatus: 'verified',
    });
    expect(configured).not.toHaveProperty('ciphertext');
  });

  test('resolves credentials only within the verified UID path', async () => {
    const vault = await import('@/lib/server/auth/credential-vault');
    await vault.saveTeacherProviderCredential({
      userId: 'teacher-a',
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      apiKey: 'teacher-a-secret',
      verificationStatus: 'verified',
    });
    await vault.saveTeacherProviderCredential({
      userId: 'teacher-b',
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      apiKey: 'teacher-b-secret',
      verificationStatus: 'verified',
    });

    await expect(vault.resolveTeacherProviderCredential('teacher-a')).resolves.toMatchObject({
      apiKey: 'teacher-a-secret',
    });
    await expect(vault.resolveTeacherProviderCredential('teacher-b')).resolves.toMatchObject({
      apiKey: 'teacher-b-secret',
    });
  });

  test('updates verification status without rewriting the key', async () => {
    const vault = await import('@/lib/server/auth/credential-vault');
    await vault.saveTeacherProviderCredential({
      userId: 'teacher-a',
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      apiKey: 'secret-provider-key-A92F',
      verificationStatus: 'unverified',
    });
    const before = documents.get('users/teacher-a/providerCredentials/qwen')!.ciphertext;
    await vault.setTeacherProviderVerificationStatus('teacher-a', 'qwen', 'verified');
    const after = documents.get('users/teacher-a/providerCredentials/qwen')!;
    expect(after.ciphertext).toBe(before);
    expect(after.verificationStatus).toBe('verified');
    expect(JSON.stringify(after)).not.toContain('secret-provider-key-A92F');
  });

  test('fails safely under the wrong encryption key', async () => {
    const vault = await import('@/lib/server/auth/credential-vault');
    await vault.saveTeacherProviderCredential({
      userId: 'teacher-a',
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      apiKey: 'teacher-a-secret',
      verificationStatus: 'verified',
    });
    process.env.APP_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
    await expect(vault.resolveTeacherProviderCredential('teacher-a')).rejects.toThrow();
  });
});
