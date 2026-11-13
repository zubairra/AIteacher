import { describe, expect, it } from 'vitest';

import {
  applyParsedBillingEvent,
  emptyBilling,
  formatInr,
  isTeacherEntitled,
  parseRazorpayWebhook,
  subscriptionStartAtUnix,
  TEACHER_PLAN,
  toTeacherBillingView,
  trialDaysLeft,
  withCreatedSubscription,
} from '@/lib/teacher/billing';
import { subscriptionCreateBody, publicRazorpayMessage } from '@/lib/server/billing/subscription';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 13);

function trial(startedAt = NOW): ReturnType<typeof emptyBilling> {
  return emptyBilling('teacher-a', startedAt, NOW);
}

describe('teacher billing plan', () => {
  it('keeps the price and the trial length in one config', () => {
    expect(TEACHER_PLAN.trialDays).toBe(15);
    expect(TEACHER_PLAN.pricePaise).toBe(9900);
    expect(TEACHER_PLAN.currency).toBe('INR');
    expect(formatInr(TEACHER_PLAN.pricePaise)).toContain('99');
  });

  it('starts a 15-day trial that still allows generation', () => {
    const record = trial();
    expect(record.trialEndsAt - record.trialStartedAt).toBe(15 * DAY);
    expect(trialDaysLeft(record, NOW)).toBe(15);
    expect(isTeacherEntitled(record, NOW)).toBe(true);
    expect(toTeacherBillingView(record, NOW).headline).toContain('15 days left');
    expect(toTeacherBillingView(record, NOW).canSubscribe).toBe(true);
  });

  it('blocks generation after the trial when there is no active subscription', () => {
    const record = trial(NOW - 20 * DAY);
    expect(isTeacherEntitled(record, NOW)).toBe(false);
    expect(toTeacherBillingView(record, NOW).phase).toBe('expired');
    for (const status of ['halted', 'past_due', 'cancelled', 'pending', 'completed'] as const) {
      expect(isTeacherEntitled({ ...record, status }, NOW)).toBe(false);
    }
  });

  it('allows generation when Razorpay reports an active or authorised subscription', () => {
    const expired = trial(NOW - 20 * DAY);
    expect(isTeacherEntitled({ ...expired, status: 'active' }, NOW)).toBe(true);
    expect(isTeacherEntitled({ ...expired, status: 'authenticated' }, NOW)).toBe(true);
    const view = toTeacherBillingView(
      {
        ...expired,
        status: 'active',
        razorpaySubscriptionId: 'sub_live',
        currentPeriodEnd: NOW + 10 * DAY,
      },
      NOW,
    );
    expect(view.phase).toBe('active');
    expect(view.canCancel).toBe(true);
    expect(view.nextBillingDate).toBeTruthy();
  });

  it('schedules the first charge at the end of a fresh trial', () => {
    const record = trial();
    const { body, startAt } = subscriptionCreateBody('teacher-a', 'plan_test', record, NOW);
    expect(startAt).toBe(Math.floor(record.trialEndsAt / 1000));
    expect(body).toMatchObject({
      plan_id: 'plan_test',
      total_count: TEACHER_PLAN.cycleCount,
      customer_notify: 1,
      notes: { uid: 'teacher-a', product: 'smartboard-teacher' },
      start_at: startAt,
    });
    expect(JSON.stringify(body)).not.toMatch(/secret|key_secret/i);
  });

  it('charges immediately once the trial is over', () => {
    const record = trial(NOW - 20 * DAY);
    expect(subscriptionStartAtUnix(record.trialEndsAt, NOW)).toBeNull();
    const { body } = subscriptionCreateBody('teacher-a', 'plan_test', record, NOW);
    expect(body).not.toHaveProperty('start_at');
  });

  it('activates, then ignores an older event and a replay of the same status', () => {
    const started = withCreatedSubscription(trial(), 'sub_123', 'plan_test', NOW);
    const activated = applyParsedBillingEvent(
      started,
      parseRazorpayWebhook({
        event: 'subscription.activated',
        created_at: 200,
        payload: {
          subscription: {
            entity: {
              id: 'sub_123',
              plan_id: 'plan_test',
              status: 'active',
              current_end: 1_800_000_000,
              notes: { uid: 'teacher-a' },
            },
          },
        },
      })!,
    );
    expect(activated.status).toBe('active');
    expect(activated.currentPeriodEnd).toBe(1_800_000_000_000);
    const stale = applyParsedBillingEvent(
      activated,
      parseRazorpayWebhook({
        event: 'subscription.pending',
        created_at: 100,
        payload: { subscription: { entity: { id: 'sub_123', status: 'pending' } } },
      })!,
    );
    expect(stale.status).toBe('active');
  });

  it('marks a failed or halted payment as not entitled after the trial', () => {
    const active = { ...trial(NOW - 20 * DAY), status: 'active' as const, lastEventAt: 1000 };
    const failed = applyParsedBillingEvent(
      active,
      parseRazorpayWebhook({
        event: 'payment.failed',
        created_at: 2,
        payload: {
          payment: { entity: { subscription_id: 'sub_123', notes: { uid: 'teacher-a' } } },
        },
      })!,
    );
    expect(failed.status).toBe('past_due');
    expect(failed.razorpaySubscriptionId).toBe('sub_123');
    expect(isTeacherEntitled(failed, NOW)).toBe(false);
    const halted = applyParsedBillingEvent(
      { ...active, lastEventAt: 0 },
      parseRazorpayWebhook({
        event: 'subscription.halted',
        created_at: 3,
        payload: {
          subscription: {
            entity: { id: 'sub_123', status: 'halted', notes: { uid: 'teacher-a' } },
          },
        },
      })!,
    );
    expect(halted.status).toBe('halted');
    expect(isTeacherEntitled(halted, NOW)).toBe(false);
    const cancelled = applyParsedBillingEvent(
      { ...active, lastEventAt: 0, cancelAtPeriodEnd: true },
      parseRazorpayWebhook({
        event: 'subscription.cancelled',
        created_at: 4,
        payload: { subscription: { entity: { id: 'sub_123', status: 'cancelled' } } },
      })!,
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelAtPeriodEnd).toBe(false);
    expect(isTeacherEntitled(cancelled, NOW)).toBe(false);
  });

  it('does not return a Razorpay secret in a provider error', () => {
    const previous = process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret_value';
    try {
      expect(
        publicRazorpayMessage({
          error: { description: 'bad key rzp_test_secret_value' },
        }),
      ).toBe('Razorpay could not update the subscription.');
    } finally {
      if (previous === undefined) delete process.env.RAZORPAY_KEY_SECRET;
      else process.env.RAZORPAY_KEY_SECRET = previous;
    }
  });
});
