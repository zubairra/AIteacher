import { beforeEach, describe, expect, test, vi } from 'vitest';

const createTeacherSession = vi.fn();
vi.mock('@/lib/server/auth/session', () => ({
  createTeacherSession,
  teacherSessionCookie: (token: string) => `smartboard_firebase_session=${token}; HttpOnly`,
}));
vi.mock('@/lib/server/auth/request-security', () => ({ isSameOriginMutation: () => true }));

function request(body: unknown) {
  return new Request('http://localhost/api/auth/sign-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Firebase teacher sign-in API contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('exchanges a verified ID token for an HTTP-only session', async () => {
    createTeacherSession.mockResolvedValue({
      token: 'opaque-session-cookie',
      user: { id: 'firebase-uid-a', name: 'Teacher A', email: 'teacher@example.test' },
    });
    const { POST } = await import('@/app/api/auth/sign-in/route');
    const response = await POST(request({ idToken: 'x'.repeat(200) }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(await response.json()).toEqual({
      ok: true,
      user: { id: 'firebase-uid-a', name: 'Teacher A', email: 'teacher@example.test' },
    });
  });

  test('rejects missing or malformed ID tokens before Firebase Admin', async () => {
    const { POST } = await import('@/app/api/auth/sign-in/route');
    const response = await POST(request({ idToken: 'short' }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: 'INVALID_CREDENTIALS' });
    expect(createTeacherSession).not.toHaveBeenCalled();
  });

  test('normalizes Firebase Admin failure without exposing the token', async () => {
    createTeacherSession.mockRejectedValue(new Error('Firebase credential configuration failed'));
    const { POST } = await import('@/app/api/auth/sign-in/route');
    const response = await POST(request({ idToken: 'secret-id-token-'.repeat(20) }));
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).toContain('AUTH_CONFIGURATION_ERROR');
    expect(text).not.toContain('secret-id-token');
  });
});
