import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { resetTestAccountRoles, setTestAccountRole } from '@/lib/server/student/account';

vi.mock('@/lib/server/auth/session', () => ({
  resolveTeacherSessionRequest: async () => ({
    id: 'student-a',
    name: 'Amina',
    email: 'amina@example.test',
  }),
}));

const resolveTeacherProviderCredential = vi.fn();
vi.mock('@/lib/server/auth/credential-vault', () => ({
  resolveTeacherProviderCredential,
}));

describe('student sessions cannot spend teacher generation', () => {
  beforeEach(() => {
    resetTestAccountRoles();
    resolveTeacherProviderCredential.mockReset();
  });

  it('rejects a student before a lesson cap or a provider call', async () => {
    setTestAccountRole('student-a', 'student');
    const { requireTeacherGeneration } = await import('@/lib/server/auth/generation-access');
    const denied = await requireTeacherGeneration(
      new NextRequest('http://localhost/api/generate/image', { method: 'POST' }),
    );
    expect(denied?.status).toBe(403);
    expect(resolveTeacherProviderCredential).not.toHaveBeenCalled();
  });

  it('does not resolve the lesson owner key for a student model request', async () => {
    setTestAccountRole('student-a', 'student');
    const { resolveModelFromHeaders } = await import('@/lib/server/resolve-model');
    await expect(
      resolveModelFromHeaders(
        new NextRequest('http://localhost/api/chat', {
          headers: { 'x-api-key': 'sk-browser-should-not-unlock-the-owner' },
        }),
      ),
    ).rejects.toThrow();
    expect(resolveTeacherProviderCredential).not.toHaveBeenCalled();
  });
});
