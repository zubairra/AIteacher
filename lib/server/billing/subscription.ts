import Razorpay from 'razorpay';

import {
  TEACHER_PLAN,
  subscriptionStartAtUnix,
  type TeacherBillingRecord,
} from '@/lib/teacher/billing';

export interface CreatedSubscription {
  subscriptionId: string;
  keyId: string;
  startAt: number | null;
}

export function razorpayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID?.trim() || null;
}

export function razorpayKeySecret(): string | null {
  return process.env.RAZORPAY_KEY_SECRET?.trim() || null;
}

export function razorpayPlanId(): string | null {
  return process.env.RAZORPAY_PLAN_ID?.trim() || null;
}

export function razorpayWebhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;
}

/** Checkout can use the public key id. It is the same value as RAZORPAY_KEY_ID. */
export function razorpayCheckoutKeyId(): string | null {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || razorpayKeyId();
}

export function razorpaySubscriptions(): {
  create(body: Record<string, unknown>): Promise<{ id: string }>;
  cancel(subscriptionId: string, cancelAtCycleEnd?: boolean): Promise<unknown>;
} | null {
  const keyId = razorpayKeyId();
  const keySecret = razorpayKeySecret();
  if (!keyId || !keySecret) return null;
  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client.subscriptions as unknown as {
    create(body: Record<string, unknown>): Promise<{ id: string }>;
    cancel(subscriptionId: string, cancelAtCycleEnd?: boolean): Promise<unknown>;
  };
}

export function subscriptionCreateBody(
  uid: string,
  planId: string,
  record: TeacherBillingRecord,
  now: number,
): { body: Record<string, unknown>; startAt: number | null } {
  const startAt = subscriptionStartAtUnix(record.trialEndsAt, now);
  return {
    startAt,
    body: {
      plan_id: planId,
      total_count: TEACHER_PLAN.cycleCount,
      quantity: 1,
      customer_notify: 1,
      notes: { uid, product: 'smartboard-teacher' },
      ...(startAt ? { start_at: startAt } : {}),
    },
  };
}

export function publicRazorpayMessage(error: unknown): string {
  const secret = razorpayKeySecret() ?? '';
  const keyId = razorpayKeyId() ?? '';
  let message = 'Razorpay could not update the subscription.';
  if (error && typeof error === 'object' && 'error' in error) {
    const description = (error as { error?: { description?: unknown } }).error?.description;
    if (typeof description === 'string' && description.trim()) message = description.trim();
  } else if (error instanceof Error && error.message && error.message !== 'ALREADY_SUBSCRIBED') {
    message = error.message;
  }
  if ((secret && message.includes(secret)) || (keyId && message.includes(keyId))) {
    return 'Razorpay could not update the subscription.';
  }
  return message;
}
