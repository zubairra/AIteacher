import Razorpay from 'razorpay';

import {
  CHALK_PLANS,
  planIdEnv,
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

export function razorpayPlanId(plan: 'pro' | 'max' | 'school' = 'pro'): string | null {
  return planIdEnv(plan);
}

export function razorpayWebhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;
}

/** Checkout can use the public key id. It is the same value as RAZORPAY_KEY_ID. */
export function razorpayCheckoutKeyId(): string | null {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || razorpayKeyId();
}

export function razorpayClient(): {
  subscriptions: {
    create(body: Record<string, unknown>): Promise<{ id: string }>;
    cancel(subscriptionId: string, cancelAtCycleEnd?: boolean): Promise<unknown>;
  };
  orders: {
    create(body: Record<string, unknown>): Promise<{ id: string }>;
  };
} | null {
  const keyId = razorpayKeyId();
  const keySecret = razorpayKeySecret();
  if (!keyId || !keySecret) return null;
  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client as unknown as {
    subscriptions: {
      create(body: Record<string, unknown>): Promise<{ id: string }>;
      cancel(subscriptionId: string, cancelAtCycleEnd?: boolean): Promise<unknown>;
    };
    orders: {
      create(body: Record<string, unknown>): Promise<{ id: string }>;
    };
  };
}

export function razorpaySubscriptions() {
  return razorpayClient()?.subscriptions ?? null;
}

export function subscriptionCreateBody(
  uid: string,
  plan: 'pro' | 'max' | 'school',
  planId: string,
  record: TeacherBillingRecord,
  now: number,
  seats = 1,
): { body: Record<string, unknown>; startAt: number | null } {
  const config =
    plan === 'school' ? CHALK_PLANS.school : plan === 'max' ? CHALK_PLANS.max : CHALK_PLANS.pro;
  const startAt = plan === 'school' ? null : subscriptionStartAtUnix(record.trialEndsAt, now);
  return {
    startAt,
    body: {
      plan_id: planId,
      total_count: config.cycleCount,
      quantity: plan === 'school' ? seats : 1,
      customer_notify: 1,
      notes: { uid, plan, product: 'smartboard-teacher' },
      ...(startAt ? { start_at: startAt } : {}),
    },
  };
}

export function topUpOrderBody(uid: string): Record<string, unknown> {
  return {
    amount: CHALK_PLANS.topUp.pricePaise,
    currency: CHALK_PLANS.currency,
    receipt: `chalks_${uid.slice(0, 12)}_${Date.now()}`,
    notes: { uid, kind: 'chalk-topup', chalks: String(CHALK_PLANS.topUp.chalks) },
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
