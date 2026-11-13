import { describe, expect, it } from 'vitest';

import {
  applyParsedBillingEvent,
  emptyBilling,
  formatInr,
  isTeacherEntitled,
  parseRazorpayWebhook,
  subscriptionStartAtUnix,
  CHALK_PLANS,
  planMarginPaise,
  reserveChalk,
  settleChalk,
  recordSchoolUsage,
  schoolPoolAllowance,
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
    expect(CHALK_PLANS.trial.days).toBe(15);
    expect(CHALK_PLANS.trial.chalks).toBe(10);
    expect(CHALK_PLANS.pro.pricePaise).toBe(9900);
    expect(CHALK_PLANS.pro.chalksPerMonth).toBe(20);
    expect(CHALK_PLANS.max.pricePaise).toBe(49900);
    expect(CHALK_PLANS.max.chalksPerMonth).toBe(130);
    expect(CHALK_PLANS.school.minSeats).toBe(10);
    expect(CHALK_PLANS.school.annualPaisePerSeat).toBe(106800);
    expect(CHALK_PLANS.topUp.chalks).toBe(100);
    expect(CHALK_PLANS.ownKeyConsumesChalk).toBe(false);
    expect(
      planMarginPaise(CHALK_PLANS.pro.pricePaise, CHALK_PLANS.pro.chalksPerMonth),
    ).toBeGreaterThan(2000);
    expect(
      planMarginPaise(CHALK_PLANS.max.pricePaise, CHALK_PLANS.max.chalksPerMonth),
    ).toBeGreaterThan(2000);
    expect(
      planMarginPaise(
        CHALK_PLANS.school.pricePaisePerSeatPerMonth,
        CHALK_PLANS.school.chalksPerSeatPerMonth,
      ),
    ).toBeGreaterThan(2000);
    expect(formatInr(CHALK_PLANS.pro.pricePaise)).toContain('99');
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
    const expired = { ...trial(NOW - 20 * DAY), plan: 'pro' as const, monthlyChalks: 20 };
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
    const { body, startAt } = subscriptionCreateBody('teacher-a', 'pro', 'plan_test', record, NOW);
    expect(startAt).toBe(Math.floor(record.trialEndsAt / 1000));
    expect(body).toMatchObject({
      plan_id: 'plan_test',
      total_count: CHALK_PLANS.pro.cycleCount,
      customer_notify: 1,
      notes: { uid: 'teacher-a', product: 'smartboard-teacher' },
      start_at: startAt,
    });
    expect(JSON.stringify(body)).not.toMatch(/secret|key_secret/i);
  });

  it('charges immediately once the trial is over', () => {
    const record = trial(NOW - 20 * DAY);
    expect(subscriptionStartAtUnix(record.trialEndsAt, NOW)).toBeNull();
    const { body } = subscriptionCreateBody('teacher-a', 'pro', 'plan_test', record, NOW);
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

  it('spends one chalk for a lesson and returns it when that lesson fails', () => {
    const record = trial();
    const reserved = reserveChalk(record, null, 'hold-1', NOW);
    expect(reserved.ok).toBe(true);
    expect(reserved.record.monthlyChalks).toBe(CHALK_PLANS.trial.chalks - 1);
    const again = reserveChalk(reserved.record, null, 'hold-1', NOW);
    expect(again.record.monthlyChalks).toBe(CHALK_PLANS.trial.chalks - 1);
    const failed = settleChalk(reserved.record, null, 'hold-1', false);
    expect(failed.record.monthlyChalks).toBe(CHALK_PLANS.trial.chalks);
    const spent = settleChalk(reserved.record, null, 'hold-1', true);
    expect(spent.record.monthlyChalks).toBe(CHALK_PLANS.trial.chalks - 1);
    expect(spent.record.topUpChalks).toBe(0);
  });

  it('resets monthly chalks without dropping a top-up', () => {
    const record = {
      ...trial(NOW - 40 * DAY),
      plan: 'pro' as const,
      status: 'active' as const,
      monthlyChalks: 4,
      topUpChalks: 12,
      currentPeriodEnd: NOW - DAY,
    };
    const view = toTeacherBillingView(record, NOW);
    expect(view.monthlyChalks).toBe(0);
    expect(view.topUpChalks).toBe(12);
    expect(view.chalksLeft).toBe(12);
    const refilled = applyParsedBillingEvent(record, {
      name: 'subscription.charged',
      createdAtMs: NOW,
      subscriptionId: 'sub_123',
      orderId: null,
      uid: 'teacher-a',
      schoolId: null,
      plan: 'pro',
      quantity: null,
      topUp: false,
      status: 'active',
      planId: 'plan_pro',
      currentPeriodEnd: NOW + 30 * DAY,
    });
    expect(refilled.monthlyChalks).toBe(CHALK_PLANS.pro.chalksPerMonth);
    expect(refilled.topUpChalks).toBe(12);
  });

  it('shares a school pool and records which teacher used a chalk', () => {
    const teacher = { ...trial(), schoolId: 'school-1', monthlyChalks: 0, plan: 'school' as const };
    const pool = {
      seatCount: CHALK_PLANS.school.minSeats,
      poolChalks: schoolPoolAllowance(CHALK_PLANS.school.minSeats),
      status: 'active' as const,
      pilotEndsAt: null,
      periodEnd: NOW + 30 * DAY,
    };
    expect(pool.poolChalks).toBe(170);
    const first = reserveChalk(teacher, pool, 'hold-a', NOW);
    const second = reserveChalk({ ...teacher, ownerUid: 'teacher-b' }, first.school, 'hold-b', NOW);
    expect(second.school?.poolChalks).toBe(168);
    const usage = recordSchoolUsage(recordSchoolUsage({}, 'teacher-a'), 'teacher-b');
    expect(usage).toEqual({ 'teacher-a': 1, 'teacher-b': 1 });
    const returned = settleChalk(first.record, first.school, 'hold-a', false);
    expect(returned.school?.poolChalks).toBe(first.school!.poolChalks + 1);
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
