import { afterEach, describe, expect, it, vi } from 'vitest';

import { planIdEnv } from '@/lib/teacher/billing';
import { razorpayClient, razorpayWebhookSecret } from '@/lib/server/billing/subscription';

describe('Razorpay configuration is optional', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads checkout helpers when no Razorpay variables are set', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', '');
    vi.stubEnv('RAZORPAY_KEY_SECRET', '');
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '');
    vi.stubEnv('RAZORPAY_PRO_PLAN_ID', '');
    vi.stubEnv('RAZORPAY_MAX_PLAN_ID', '');
    vi.stubEnv('RAZORPAY_SCHOOL_PLAN_ID', '');
    vi.stubEnv('RAZORPAY_PLAN_ID', '');
    expect(razorpayClient()).toBeNull();
    expect(razorpayWebhookSecret()).toBeNull();
    expect(planIdEnv('pro')).toBeNull();
    expect(planIdEnv('max')).toBeNull();
    expect(planIdEnv('school')).toBeNull();
  });
});
