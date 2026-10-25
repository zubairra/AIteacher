import { beforeEach, describe, expect, test, vi } from 'vitest';

const resolveTeacherSessionRequest = vi.fn();
const resolveTeacherProviderCredential = vi.fn();
const setTeacherProviderVerificationStatus = vi.fn();
const listTeacherProviderCredentials = vi.fn();
const probeTeacherProvider = vi.fn();

vi.mock('@/lib/server/auth/session', () => ({ resolveTeacherSessionRequest }));
vi.mock('@/lib/server/auth/request-security', () => ({ isSameOriginMutation: () => true }));
vi.mock('@/lib/server/auth/credential-vault', () => ({
  isTeacherProviderId: (value: string) => value === 'qwen',
  resolveTeacherProviderCredential,
  setTeacherProviderVerificationStatus,
  listTeacherProviderCredentials,
}));
vi.mock('@/lib/server/auth/provider-probe', () => ({ probeTeacherProvider }));

const SECRET = 'sk-fake-qwen-test-A92F';

function request(body: unknown) {
  return new Request('http://127.0.0.1:3000/api/teacher/providers/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/teacher/providers/test', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resolveTeacherSessionRequest.mockResolvedValue({
      id: 'teacher-a',
      name: 'Teacher A',
      email: 'a@example.test',
    });
    listTeacherProviderCredentials.mockResolvedValue([
      {
        providerId: 'qwen',
        configured: true,
        maskedSuffix: 'A92F',
        verificationStatus: 'unverified',
      },
    ]);
  });

  test('checks a saved key and returns only the masked status', async () => {
    resolveTeacherProviderCredential.mockResolvedValue({
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      apiKey: SECRET,
    });
    probeTeacherProvider.mockResolvedValue({ ok: true, message: 'Connection successful.' });
    const { POST } = await import('@/app/api/teacher/providers/test/route');
    const response = await POST(request({ providerId: 'qwen' }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({
      ok: true,
      verificationStatus: 'verified',
      maskedSuffix: 'A92F',
      persisted: true,
    });
    expect(text).not.toContain(SECRET);
    expect(setTeacherProviderVerificationStatus).toHaveBeenCalledWith(
      'teacher-a',
      'qwen',
      'verified',
    );
    expect(probeTeacherProvider).toHaveBeenCalledWith({
      providerId: 'qwen',
      modelId: 'qwen3.7-plus',
      apiKey: SECRET,
    });
  });

  test('does not persist a typed key that has not been saved', async () => {
    probeTeacherProvider.mockResolvedValue({ ok: true, message: 'Connection successful.' });
    const { POST } = await import('@/app/api/teacher/providers/test/route');
    const response = await POST(
      request({ providerId: 'qwen', modelId: 'qwen3.7-plus', apiKey: SECRET }),
    );
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, persisted: false, maskedSuffix: 'A92F' });
    expect(resolveTeacherProviderCredential).not.toHaveBeenCalled();
    expect(setTeacherProviderVerificationStatus).not.toHaveBeenCalled();
  });
});
