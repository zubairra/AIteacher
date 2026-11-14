import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isBillingEnabled, isBillingUiEnabled } from '@/lib/config/feature-flags';
import {
  DEFAULT_FREE_LESSON_DAILY_CAP,
  freeLessonDailyCap,
  resetFreeLessonUsage,
  takeFreeLessonSlot,
} from '@/lib/server/billing/free-mode';

const resolveTeacherSessionRequest = vi.fn();
const ensureTeacherTrial = vi.fn();
const readSchoolForAdmin = vi.fn();
const razorpayClient = vi.fn();

vi.mock('@/lib/server/auth/session', () => ({
  resolveTeacherSessionRequest,
}));
vi.mock('@/lib/server/auth/request-security', () => ({
  isSameOriginMutation: () => true,
}));
vi.mock('@/lib/server/billing/store', () => ({
  ensureTeacherTrial,
  markCancelScheduled: vi.fn(),
  readTeacherBilling: vi.fn(),
  rememberCreatedSubscription: vi.fn(),
  readSchoolForAdmin,
  inviteSchoolTeacher: vi.fn(),
  removeSchoolTeacher: vi.fn(),
}));
vi.mock('@/lib/server/billing/subscription', () => ({
  publicRazorpayMessage: () => 'Razorpay could not update the subscription.',
  razorpayCheckoutKeyId: () => 'rzp_test_public',
  razorpayClient,
  razorpayPlanId: () => 'plan_test',
  subscriptionCreateBody: () => ({ body: {}, startAt: null }),
  topUpOrderBody: () => ({}),
}));

function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000' },
    body: JSON.stringify(body),
  });
}

describe('billing switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFreeLessonUsage();
  });

  afterEach(() => {
    resetFreeLessonUsage();
    vi.unstubAllEnvs();
  });

  it('defaults to off and ignores the public mirror for server gates', () => {
    vi.stubEnv('BILLING_ENABLED', '');
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'true');
    expect(isBillingEnabled()).toBe(false);
    expect(isBillingUiEnabled()).toBe(true);
    vi.stubEnv('BILLING_ENABLED', 'false');
    expect(isBillingEnabled()).toBe(false);
    vi.stubEnv('BILLING_ENABLED', '1');
    expect(isBillingEnabled()).toBe(true);
    vi.stubEnv('BILLING_ENABLED', 'true');
    expect(isBillingEnabled()).toBe(true);
  });

  it('uses a generous daily cap that can be removed', () => {
    vi.stubEnv('FREE_LESSON_DAILY_CAP', '');
    expect(freeLessonDailyCap()).toBe(DEFAULT_FREE_LESSON_DAILY_CAP);
    expect(DEFAULT_FREE_LESSON_DAILY_CAP).toBeGreaterThanOrEqual(50);
    vi.stubEnv('FREE_LESSON_DAILY_CAP', '0');
    expect(freeLessonDailyCap()).toBe(0);
    expect(takeFreeLessonSlot('teacher-a')).toBe(true);
    vi.stubEnv('FREE_LESSON_DAILY_CAP', 'nope');
    expect(freeLessonDailyCap()).toBe(DEFAULT_FREE_LESSON_DAILY_CAP);
    vi.stubEnv('FREE_LESSON_DAILY_CAP', '1');
    expect(takeFreeLessonSlot('teacher-a')).toBe(true);
    expect(takeFreeLessonSlot('teacher-a')).toBe(false);
    expect(takeFreeLessonSlot('teacher-b')).toBe(true);
  });

  it('refuses checkout without Razorpay when billing is off', async () => {
    vi.stubEnv('BILLING_ENABLED', '');
    const { POST, GET } = await import('@/app/api/teacher/billing/route');
    const created = await POST(
      post('http://127.0.0.1:3000/api/teacher/billing', { action: 'subscribe', plan: 'pro' }),
    );
    const topped = await POST(
      post('http://127.0.0.1:3000/api/teacher/billing', { action: 'topup' }),
    );
    const status = await GET(new Request('http://127.0.0.1:3000/api/teacher/billing'));
    expect(created.status).toBe(404);
    expect(topped.status).toBe(404);
    expect(status.status).toBe(404);
    await expect(created.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/free for now/i),
    });
    expect(razorpayClient).not.toHaveBeenCalled();
    expect(ensureTeacherTrial).not.toHaveBeenCalled();
    expect(resolveTeacherSessionRequest).not.toHaveBeenCalled();
  });

  it('still reaches Razorpay setup when billing is on', async () => {
    vi.stubEnv('BILLING_ENABLED', 'true');
    resolveTeacherSessionRequest.mockResolvedValue({
      id: 'teacher-a',
      name: 'Teacher A',
      email: 'a@example.test',
    });
    razorpayClient.mockReturnValue(null);
    const { POST } = await import('@/app/api/teacher/billing/route');
    const response = await POST(
      post('http://127.0.0.1:3000/api/teacher/billing', { action: 'subscribe', plan: 'pro' }),
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toMatch(/not set up yet/i);
    expect(JSON.stringify(body)).not.toMatch(/rzp_|key_secret/i);
    expect(razorpayClient).toHaveBeenCalled();
  });

  it('refuses school billing routes while billing is off', async () => {
    vi.stubEnv('BILLING_ENABLED', '');
    const { GET, POST } = await import('@/app/api/teacher/school/route');
    const listed = await GET(new Request('http://127.0.0.1:3000/api/teacher/school'));
    const invited = await POST(
      post('http://127.0.0.1:3000/api/teacher/school', {
        action: 'invite',
        email: 'teacher@school.edu',
      }),
    );
    expect(listed.status).toBe(404);
    expect(invited.status).toBe(404);
    expect(readSchoolForAdmin).not.toHaveBeenCalled();
  });
});
