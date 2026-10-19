import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { requireTeacherGeneration } from '@/lib/server/auth/generation-access';

describe('teacher generation access', () => {
  it('rejects an unauthenticated generation call with 401', async () => {
    const request = new NextRequest('http://localhost/api/generate/image', { method: 'POST' });
    const denied = await requireTeacherGeneration(request);
    expect(denied?.status).toBe(401);
    await expect(denied!.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'UNAUTHENTICATED',
      error: 'Sign in to generate a lesson.',
    });
  });

  it('rejects POST /api/generate/image before any provider work', async () => {
    const { POST } = await import('@/app/api/generate/image/route');
    const response = await POST(
      new NextRequest('http://localhost/api/generate/image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'a diagram' }),
      }),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'UNAUTHENTICATED',
      error: 'Sign in to generate a lesson.',
    });
  });
});
