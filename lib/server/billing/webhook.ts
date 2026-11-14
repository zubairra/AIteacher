import { isBillingEnabled } from '@/lib/config/feature-flags';
import { razorpaySignatureMatches, webhookEventId } from '@/lib/server/billing/signature';
import { razorpayWebhookSecret } from '@/lib/server/billing/subscription';
import { applyBillingWebhook, resolveBillingUid } from '@/lib/server/billing/store';
import { parseRazorpayWebhook, type ParsedBillingEvent } from '@/lib/teacher/billing';

export interface BillingWebhookStore {
  resolveUid(event: ParsedBillingEvent): Promise<string | null>;
  apply(
    uid: string,
    eventId: string,
    event: ParsedBillingEvent,
  ): Promise<'applied' | 'duplicate' | 'ignored'>;
}

export const firestoreBillingWebhookStore: BillingWebhookStore = {
  resolveUid: resolveBillingUid,
  apply: applyBillingWebhook,
};

export async function handleRazorpayWebhook(
  request: Request,
  store: BillingWebhookStore,
  now = Date.now(),
): Promise<Response> {
  if (!isBillingEnabled()) {
    // Inert while subscriptions are off: nothing is applied, and Razorpay is
    // not required. Checkout routes answer 404 instead.
    return Response.json({ ok: true, result: 'disabled' });
  }
  const secret = razorpayWebhookSecret();
  if (!secret) return new Response('Webhook is not configured', { status: 503 });
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  if (!razorpaySignatureMatches(rawBody, signature, secret)) {
    return new Response('Invalid signature', { status: 400 });
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody) as unknown;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const event = parseRazorpayWebhook(json, now);
  if (!event) return Response.json({ ok: true, result: 'ignored' });
  const uid = await store.resolveUid(event);
  if (!uid) return Response.json({ ok: true, result: 'ignored' });
  const eventId = webhookEventId(request.headers.get('x-razorpay-event-id'), rawBody);
  const result = await store.apply(uid, eventId, event);
  return Response.json({ ok: true, result });
}
