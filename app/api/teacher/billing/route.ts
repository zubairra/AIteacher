import { apiError } from '@/lib/server/api-response';
import { isSameOriginMutation } from '@/lib/server/auth/request-security';
import { resolveTeacherSessionRequest } from '@/lib/server/auth/session';
import {
  publicRazorpayMessage,
  razorpayCheckoutKeyId,
  razorpayClient,
  razorpayPlanId,
  subscriptionCreateBody,
  topUpOrderBody,
} from '@/lib/server/billing/subscription';
import { CHALK_PLANS } from '@/lib/teacher/billing';
import {
  ensureTeacherTrial,
  markCancelScheduled,
  readTeacherBilling,
  rememberCreatedSubscription,
} from '@/lib/server/billing/store';
import { toTeacherBillingView } from '@/lib/teacher/billing';

export const runtime = 'nodejs';

async function teacher(request: Request) {
  if (!isSameOriginMutation(request))
    return { error: apiError('FORBIDDEN', 403, 'This request was not accepted.') };
  const user = await resolveTeacherSessionRequest(request);
  if (!user) return { error: apiError('UNAUTHENTICATED', 401, 'Sign in to manage billing.') };
  return { user };
}

export async function GET(request: Request) {
  const user = await resolveTeacherSessionRequest(request);
  if (!user) return apiError('UNAUTHENTICATED', 401, 'Sign in to manage billing.');
  try {
    const record = await ensureTeacherTrial(user.id);
    return Response.json({ ok: true, billing: toTeacherBillingView(record, Date.now()) });
  } catch {
    return apiError(
      'INTERNAL_ERROR',
      503,
      'Billing status could not be checked. Try again in a moment.',
    );
  }
}

export async function POST(request: Request) {
  const gate = await teacher(request);
  if ('error' in gate && gate.error) return gate.error;
  const user = gate.user;
  if (!user) return apiError('UNAUTHENTICATED', 401, 'Sign in to manage billing.');
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    plan?: unknown;
    seats?: unknown;
  } | null;
  if (body?.action === 'cancel') return cancel(user.id);
  if (body?.action === 'topup') return topUp(user.id);
  if (body?.action === 'subscribe') {
    const plan = body.plan === 'max' || body.plan === 'school' ? body.plan : 'pro';
    const seats = typeof body.seats === 'number' ? body.seats : CHALK_PLANS.school.minSeats;
    return subscribe(user.id, plan, seats);
  }
  return apiError('INVALID_REQUEST', 400, 'Choose subscribe, top up, or cancel.');
}

async function subscribe(uid: string, plan: 'pro' | 'max' | 'school', seats: number) {
  if (plan === 'school' && seats < CHALK_PLANS.school.minSeats) {
    return apiError(
      'INVALID_REQUEST',
      400,
      `A school plan needs at least ${CHALK_PLANS.school.minSeats} seats.`,
    );
  }
  const planId = razorpayPlanId(plan);
  const keyId = razorpayCheckoutKeyId();
  const subscriptions = razorpayClient()?.subscriptions ?? null;
  if (!planId || !keyId || !subscriptions) {
    return apiError(
      'INTERNAL_ERROR',
      503,
      'Billing is not set up yet. Add the Razorpay plan and keys on the server.',
    );
  }
  try {
    const now = Date.now();
    const record = await ensureTeacherTrial(uid, undefined, now);
    if (
      (record.plan === 'pro' || record.plan === 'max') &&
      (record.status === 'active' || record.status === 'authenticated')
    ) {
      return apiError('INVALID_REQUEST', 409, 'A monthly plan is already active.');
    }
    const { body, startAt } = subscriptionCreateBody(uid, plan, planId, record, now, seats);
    const created = await subscriptions.create(body);
    if (!created.id) {
      return apiError('UPSTREAM_ERROR', 502, 'Razorpay did not return a subscription.');
    }
    await rememberCreatedSubscription(uid, created.id, planId, now, plan);
    return Response.json({
      ok: true,
      keyId,
      subscriptionId: created.id,
      startAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_SUBSCRIBED') {
      return apiError('INVALID_REQUEST', 409, 'The Teacher plan is already active.');
    }
    return apiError('UPSTREAM_ERROR', 502, publicRazorpayMessage(error));
  }
}

async function topUp(uid: string) {
  const keyId = razorpayCheckoutKeyId();
  const orders = razorpayClient()?.orders ?? null;
  if (!keyId || !orders) {
    return apiError(
      'INTERNAL_ERROR',
      503,
      'Billing is not set up yet. Add the Razorpay keys on the server.',
    );
  }
  try {
    await ensureTeacherTrial(uid);
    const created = await orders.create(topUpOrderBody(uid));
    if (!created.id) return apiError('UPSTREAM_ERROR', 502, 'Razorpay did not return an order.');
    return Response.json({ ok: true, keyId, orderId: created.id });
  } catch (error) {
    return apiError('UPSTREAM_ERROR', 502, publicRazorpayMessage(error));
  }
}

async function cancel(uid: string) {
  const subscriptions = razorpayClient()?.subscriptions ?? null;
  if (!subscriptions) {
    return apiError(
      'INTERNAL_ERROR',
      503,
      'Billing is not set up yet. Add the Razorpay plan and keys on the server.',
    );
  }
  try {
    const record = await readTeacherBilling(uid);
    if (!record?.razorpaySubscriptionId) {
      return apiError('INVALID_REQUEST', 400, 'There is no subscription to cancel.');
    }
    await subscriptions.cancel(record.razorpaySubscriptionId, true);
    await markCancelScheduled(uid);
    const next = await readTeacherBilling(uid);
    return Response.json({
      ok: true,
      billing: toTeacherBillingView(next ?? record, Date.now()),
    });
  } catch (error) {
    return apiError('UPSTREAM_ERROR', 502, publicRazorpayMessage(error));
  }
}
