import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const cookiesMock = vi.fn();
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const verifySessionCookie = vi.fn();

vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/server/firebase/admin', () => ({
  firebaseAdminAuth: () => ({ verifySessionCookie }),
}));

describe('teacher sessions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {});

  test('redirects a protected page when no session cookie exists', async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined });
    const { requireTeacherPageSession } = await import('@/lib/server/auth/session');

    await expect(requireTeacherPageSession()).rejects.toThrow('REDIRECT:/sign-in');
    expect(verifySessionCookie).not.toHaveBeenCalled();
  });

  test('allows authenticated access when the persisted session is valid', async () => {
    cookiesMock.mockResolvedValue({ get: () => ({ value: 'opaque-token' }) });
    verifySessionCookie.mockResolvedValue({
      uid: 'teacher-a',
      name: 'Teacher A',
      email: 'teacher@example.test',
    });
    const { requireTeacherPageSession } = await import('@/lib/server/auth/session');

    await expect(requireTeacherPageSession()).resolves.toEqual({
      id: 'teacher-a',
      name: 'Teacher A',
      email: 'teacher@example.test',
    });
    expect(verifySessionCookie).toHaveBeenCalledWith('opaque-token', true);
  });

  test('rejects an expired or revoked Firebase session', async () => {
    verifySessionCookie.mockRejectedValue(new Error('expired'));
    const { resolveTeacherSessionToken } = await import('@/lib/server/auth/session');
    await expect(resolveTeacherSessionToken('expired-token')).resolves.toBeNull();
  });
});
