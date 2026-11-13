import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const resolveTeacherSessionRequest = vi.fn();
const ensureTeacherTrial = vi.fn();

vi.mock('@/lib/server/auth/session', () => ({
  resolveTeacherSessionRequest,
}));
vi.mock('@/lib/server/billing/store', () => ({
  ensureTeacherTrial,
}));

describe('subscription gate on generation', () => {
  it('blocks an expired trial before any provider call', async () => {
    resolveTeacherSessionRequest.mockResolvedValue({
      id: 'teacher-a',
      name: 'Teacher A',
      email: 'teacher-a@example.test',
    });
    const { emptyBilling } = await import('@/lib/teacher/billing');
    ensureTeacherTrial.mockResolvedValue(
      emptyBilling('teacher-a', Date.now() - 40 * 24 * 60 * 60 * 1000, Date.now()),
    );
    const { requireTeacherGeneration } = await import('@/lib/server/auth/generation-access');
    const denied = await requireTeacherGeneration(
      new NextRequest('http://localhost/api/generate/scene-outlines-stream', { method: 'POST' }),
    );
    expect(denied?.status).toBe(402);
    const body = await denied!.json();
    expect(body).toMatchObject({ success: false, errorCode: 'SUBSCRIPTION_REQUIRED' });
    expect(JSON.stringify(body)).not.toMatch(/rzp_|secret|key_secret/i);
  });

  it('allows an active subscription', async () => {
    resolveTeacherSessionRequest.mockResolvedValue({
      id: 'teacher-a',
      name: 'Teacher A',
      email: 'teacher-a@example.test',
    });
    const { emptyBilling } = await import('@/lib/teacher/billing');
    ensureTeacherTrial.mockResolvedValue({
      ...emptyBilling('teacher-a', Date.now() - 40 * 24 * 60 * 60 * 1000, Date.now()),
      status: 'active',
      plan: 'pro',
      monthlyChalks: 20,
    });
    const { requireTeacherGeneration } = await import('@/lib/server/auth/generation-access');
    const denied = await requireTeacherGeneration(
      new NextRequest('http://localhost/api/generate/image', { method: 'POST' }),
    );
    expect(denied).toBeNull();
  });
});
