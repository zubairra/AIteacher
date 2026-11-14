import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const resolveTeacherSessionRequest = vi.fn();
const ensureTeacherTrial = vi.fn();
const reserveLessonChalk = vi.fn();

vi.mock('@/lib/server/auth/session', () => ({
  resolveTeacherSessionRequest,
}));
vi.mock('@/lib/server/billing/store', () => ({
  ensureTeacherTrial,
  reserveLessonChalk,
}));

const teacher = {
  id: 'teacher-a',
  name: 'Teacher A',
  email: 'teacher-a@example.test',
};

function lessonRequest() {
  return new NextRequest('http://localhost/api/generate/scene-outlines-stream', { method: 'POST' });
}

describe('subscription gate on generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_ENABLED', 'true');
    resolveTeacherSessionRequest.mockResolvedValue(teacher);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('blocks an expired trial before any provider call', async () => {
    const { emptyBilling } = await import('@/lib/teacher/billing');
    ensureTeacherTrial.mockResolvedValue(
      emptyBilling('teacher-a', Date.now() - 40 * 24 * 60 * 60 * 1000, Date.now()),
    );
    const { requireTeacherGeneration } = await import('@/lib/server/auth/generation-access');
    const denied = await requireTeacherGeneration(lessonRequest());
    expect(denied?.status).toBe(402);
    const body = await denied!.json();
    expect(body).toMatchObject({ success: false, errorCode: 'SUBSCRIPTION_REQUIRED' });
    expect(JSON.stringify(body)).not.toMatch(/rzp_|secret|key_secret/i);
  });

  it('allows an active subscription', async () => {
    const { emptyBilling } = await import('@/lib/teacher/billing');
    ensureTeacherTrial.mockResolvedValue({
      ...emptyBilling('teacher-a', Date.now() - 40 * 24 * 60 * 60 * 1000, Date.now()),
      status: 'active',
      plan: 'pro',
      weeklyChalks: 5,
    });
    const { requireTeacherGeneration } = await import('@/lib/server/auth/generation-access');
    const denied = await requireTeacherGeneration(
      new NextRequest('http://localhost/api/generate/image', { method: 'POST' }),
    );
    expect(denied).toBeNull();
  });

  it('still holds a chalk for a new lesson when billing is on', async () => {
    reserveLessonChalk.mockResolvedValue('denied');
    const { requireTeacherGeneration } = await import('@/lib/server/auth/generation-access');
    const denied = await requireTeacherGeneration(lessonRequest(), { lesson: true });
    expect(denied?.status).toBe(402);
    expect(reserveLessonChalk).toHaveBeenCalledWith('teacher-a', expect.any(String));
    expect(ensureTeacherTrial).toHaveBeenCalledWith('teacher-a');
  });
});

describe('generation while billing is off', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_ENABLED', '');
    vi.stubEnv('FREE_LESSON_DAILY_CAP', '2');
    resolveTeacherSessionRequest.mockResolvedValue(teacher);
    reserveLessonChalk.mockResolvedValue('denied');
    const { resetFreeLessonUsage } = await import('@/lib/server/billing/free-mode');
    resetFreeLessonUsage();
  });

  afterEach(async () => {
    const { resetFreeLessonUsage } = await import('@/lib/server/billing/free-mode');
    resetFreeLessonUsage();
    vi.unstubAllEnvs();
  });

  it('allows an expired trial without a chalk hold or a 402', async () => {
    const { emptyBilling } = await import('@/lib/teacher/billing');
    ensureTeacherTrial.mockResolvedValue(
      emptyBilling('teacher-a', Date.now() - 40 * 24 * 60 * 60 * 1000, Date.now()),
    );
    const { requireTeacherGeneration } = await import('@/lib/server/auth/generation-access');
    const allowed = await requireTeacherGeneration(lessonRequest(), { lesson: true });
    expect(allowed).toBeNull();
    expect(reserveLessonChalk).not.toHaveBeenCalled();
    expect(ensureTeacherTrial).not.toHaveBeenCalled();
  });

  it('still requires a signed-in teacher', async () => {
    resolveTeacherSessionRequest.mockResolvedValue(null);
    const { requireTeacherGeneration } = await import('@/lib/server/auth/generation-access');
    const denied = await requireTeacherGeneration(lessonRequest(), { lesson: true });
    expect(denied?.status).toBe(401);
  });

  it('applies the free daily cap only to new lessons', async () => {
    const { requireTeacherGeneration } = await import('@/lib/server/auth/generation-access');
    const first = await requireTeacherGeneration(lessonRequest(), { lesson: true });
    const second = await requireTeacherGeneration(lessonRequest(), { lesson: true });
    const third = await requireTeacherGeneration(lessonRequest(), { lesson: true });
    const image = await requireTeacherGeneration(
      new NextRequest('http://localhost/api/generate/image', { method: 'POST' }),
    );
    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(image).toBeNull();
    expect(third?.status).toBe(429);
    const body = await third!.json();
    expect(body).toMatchObject({ success: false, errorCode: 'RATE_LIMITED' });
    expect(JSON.stringify(body)).not.toMatch(/chalk|upgrade|razorpay|subscription/i);
    expect(reserveLessonChalk).not.toHaveBeenCalled();
  });

  it('does not count lessons when the free cap is 0', async () => {
    vi.stubEnv('FREE_LESSON_DAILY_CAP', '0');
    const { requireTeacherGeneration } = await import('@/lib/server/auth/generation-access');
    for (let index = 0; index < 5; index += 1) {
      expect(await requireTeacherGeneration(lessonRequest(), { lesson: true })).toBeNull();
    }
  });
});
