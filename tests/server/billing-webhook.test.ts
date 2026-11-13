import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleRazorpayWebhook, type BillingWebhookStore } from '@/lib/server/billing/webhook';
import {
  applyParsedBillingEvent,
  emptyBilling,
  type ParsedBillingEvent,
} from '@/lib/teacher/billing';

const SECRET = 'test-webhook-secret';

function signedRequest(payload: unknown, eventId = 'evt_test_1234') {
  const raw = JSON.stringify(payload);
  const signature = createHmac('sha256', SECRET).update(raw).digest('hex');
  return new Request('http://localhost/api/billing/razorpay/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': eventId,
    },
    body: raw,
  });
}

describe('Razorpay webhook', () => {
  afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it('rejects a missing or bad signature before it touches billing', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    const apply = vi.fn();
    const store: BillingWebhookStore = {
      resolveUid: vi.fn(),
      apply,
    };
    const missing = await handleRazorpayWebhook(
      new Request('http://localhost/api/billing/razorpay/webhook', {
        method: 'POST',
        body: '{}',
      }),
      store,
    );
    expect(missing.status).toBe(400);
    const forged = await handleRazorpayWebhook(
      new Request('http://localhost/api/billing/razorpay/webhook', {
        method: 'POST',
        headers: { 'x-razorpay-signature': 'deadbeef' },
        body: '{"event":"subscription.activated"}',
      }),
      store,
    );
    expect(forged.status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
    expect(
      JSON.stringify({ missing: await missing.text(), forged: await forged.text() }),
    ).not.toContain(SECRET);
  });

  it('activates a subscription and ignores the same event id', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    let record = emptyBilling('teacher-a', Date.now() - 20 * 24 * 60 * 60 * 1000, Date.now());
    const seen = new Set<string>();
    const store: BillingWebhookStore = {
      async resolveUid(event: ParsedBillingEvent) {
        return event.uid;
      },
      async apply(uid, eventId, event) {
        if (seen.has(`${uid}:${eventId}`)) return 'duplicate';
        seen.add(`${uid}:${eventId}`);
        record = applyParsedBillingEvent({ ...record, ownerUid: uid }, event);
        return 'applied';
      },
    };
    const payload = {
      event: 'subscription.activated',
      created_at: 500,
      payload: {
        subscription: {
          entity: {
            id: 'sub_123',
            plan_id: 'plan_test',
            status: 'active',
            current_end: 1_900_000_000,
            notes: { uid: 'teacher-a' },
          },
        },
      },
    };
    const first = await handleRazorpayWebhook(signedRequest(payload), store);
    const second = await handleRazorpayWebhook(signedRequest(payload), store);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ ok: true, result: 'applied' });
    await expect(second.json()).resolves.toMatchObject({ ok: true, result: 'duplicate' });
    expect(record.status).toBe('active');
    expect(record.razorpaySubscriptionId).toBe('sub_123');
  });
});
