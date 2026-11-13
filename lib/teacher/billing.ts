/**
 * India teacher plan. Change the trial and the price here only.
 * Amounts are paise (Rs 99 = 9900). Razorpay bills monthly in INR.
 */
export const TEACHER_PLAN = {
  trialDays: 15,
  pricePaise: 9900,
  currency: 'INR',
  period: 'monthly',
  interval: 1,
  /** Razorpay requires a cycle count. 120 months is the recurring term. */
  cycleCount: 120,
  name: 'SmartBoard AI Teacher',
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Razorpay rejects a subscription start_at that is sooner than this. */
export const SUBSCRIPTION_START_DELAY_MS = 15 * 60 * 1000;

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  'Your free trial has ended. Subscribe to the Teacher plan to generate new lessons. You can still open and teach lessons you already have.';

export const BILLING_STATUSES = [
  'none',
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'cancelled',
  'completed',
  'past_due',
] as const;

export type BillingStatus = (typeof BILLING_STATUSES)[number];

const PAID_ACCESS = new Set<BillingStatus>(['active', 'authenticated']);

export interface TeacherBillingRecord {
  version: 1;
  ownerUid: string;
  trialStartedAt: number;
  trialEndsAt: number;
  status: BillingStatus;
  razorpaySubscriptionId: string | null;
  razorpayPlanId: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  lastEventAt: number;
  updatedAt: number;
}

export interface TeacherBillingView {
  entitled: boolean;
  phase: 'trial' | 'active' | 'expired';
  daysLeft: number;
  priceLabel: string;
  statusLabel: string;
  headline: string;
  detail: string;
  nextBillingDate: string | null;
  canSubscribe: boolean;
  canCancel: boolean;
}

export interface ParsedBillingEvent {
  name: string;
  createdAtMs: number;
  subscriptionId: string | null;
  uid: string | null;
  status: BillingStatus | null;
  planId: string | null;
  currentPeriodEnd: number | null;
}

const EVENT_STATUS: Record<string, BillingStatus> = {
  'subscription.authenticated': 'authenticated',
  'subscription.activated': 'active',
  'subscription.charged': 'active',
  'subscription.pending': 'pending',
  'subscription.halted': 'halted',
  'subscription.cancelled': 'cancelled',
  'subscription.completed': 'completed',
  'payment.failed': 'past_due',
};

export function isBillingStatus(value: unknown): value is BillingStatus {
  return typeof value === 'string' && (BILLING_STATUSES as readonly string[]).includes(value);
}

export function trialEndsAt(startedAt: number): number {
  return startedAt + TEACHER_PLAN.trialDays * DAY_MS;
}

export function emptyBilling(uid: string, startedAt: number, now: number): TeacherBillingRecord {
  const start = Math.min(startedAt, now);
  return {
    version: 1,
    ownerUid: uid,
    trialStartedAt: start,
    trialEndsAt: trialEndsAt(start),
    status: 'none',
    razorpaySubscriptionId: null,
    razorpayPlanId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    lastEventAt: 0,
    updatedAt: now,
  };
}

export function isTeacherEntitled(record: TeacherBillingRecord, now: number): boolean {
  if (now < record.trialEndsAt) return true;
  return PAID_ACCESS.has(record.status);
}

export function trialDaysLeft(record: TeacherBillingRecord, now: number): number {
  if (now >= record.trialEndsAt) return 0;
  return Math.ceil((record.trialEndsAt - now) / DAY_MS);
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: TEACHER_PLAN.currency,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatIndiaDate(ms: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(ms));
}

/** Unix seconds for Razorpay start_at, or null when the first charge should be immediate. */
export function subscriptionStartAtUnix(trialEnd: number, now: number): number | null {
  if (trialEnd - now < SUBSCRIPTION_START_DELAY_MS) return null;
  return Math.floor(trialEnd / 1000);
}

function statusLabel(status: BillingStatus, phase: TeacherBillingView['phase']): string {
  if (phase === 'trial' && status === 'none') return 'Free trial';
  if (phase === 'expired' && status === 'none') return 'Trial ended';
  switch (status) {
    case 'active':
      return 'Active';
    case 'authenticated':
      return 'Payment authorised';
    case 'created':
      return 'Checkout started';
    case 'pending':
      return 'Payment pending';
    case 'halted':
      return 'Payment halted';
    case 'past_due':
      return 'Payment failed';
    case 'cancelled':
      return 'Cancelled';
    case 'completed':
      return 'Completed';
    default:
      return 'Trial ended';
  }
}

export function toTeacherBillingView(
  record: TeacherBillingRecord,
  now: number,
): TeacherBillingView {
  const entitled = isTeacherEntitled(record, now);
  const paid = PAID_ACCESS.has(record.status);
  const phase: TeacherBillingView['phase'] = paid ? 'active' : entitled ? 'trial' : 'expired';
  const daysLeft = trialDaysLeft(record, now);
  const priceLabel = formatInr(TEACHER_PLAN.pricePaise);
  const nextBillingDate = record.currentPeriodEnd ? formatIndiaDate(record.currentPeriodEnd) : null;
  const trialEndLabel = formatIndiaDate(record.trialEndsAt);
  const dayWord = daysLeft === 1 ? 'day' : 'days';
  let headline = `Free trial · ${daysLeft} ${dayWord} left`;
  let detail = `Then ${priceLabel} per month, billed in India. No card is needed during the trial.`;
  if (phase === 'active') {
    headline = record.cancelAtPeriodEnd ? 'Cancellation scheduled' : 'Teacher plan is active';
    detail = record.cancelAtPeriodEnd
      ? `You can keep generating lessons until ${nextBillingDate ?? 'the end of this period'}. It will not renew.`
      : nextBillingDate
        ? `Next bill of ${priceLabel} on ${nextBillingDate}.`
        : `${priceLabel} per month. The next bill appears here after Razorpay confirms the subscription.`;
  } else if (phase === 'expired') {
    headline = 'Your free trial has ended';
    detail = `Generating a new lesson needs the Teacher plan at ${priceLabel} per month. Lessons you already have can still be opened and taught.`;
  }
  return {
    entitled,
    phase,
    daysLeft,
    priceLabel,
    statusLabel: statusLabel(record.status, phase),
    headline,
    detail,
    nextBillingDate: phase === 'trial' ? trialEndLabel : nextBillingDate,
    canSubscribe: phase !== 'active',
    canCancel: paid && !record.cancelAtPeriodEnd && Boolean(record.razorpaySubscriptionId),
  };
}

function entityOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const entity = (value as { entity?: unknown }).entity;
  return entity && typeof entity === 'object' ? (entity as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function notesUid(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const uid = (value as { uid?: unknown }).uid;
  return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? uid : null;
}

export function parseRazorpayWebhook(body: unknown, now = Date.now()): ParsedBillingEvent | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const name = text(record.event);
  if (!name) return null;
  const payload =
    record.payload && typeof record.payload === 'object'
      ? (record.payload as Record<string, unknown>)
      : {};
  const subscription = entityOf(payload.subscription);
  const payment = entityOf(payload.payment);
  const createdAtSec = typeof record.created_at === 'number' ? record.created_at : 0;
  let status: BillingStatus | null = EVENT_STATUS[name] ?? null;
  if (name === 'subscription.updated') {
    const raw = text(subscription?.status);
    status = isBillingStatus(raw) ? raw : null;
  }
  const currentEnd = subscription?.current_end;
  return {
    name,
    createdAtMs: createdAtSec > 0 ? createdAtSec * 1000 : now,
    subscriptionId: text(subscription?.id) ?? text(payment?.subscription_id),
    uid: notesUid(subscription?.notes) ?? notesUid(payment?.notes),
    status,
    planId: text(subscription?.plan_id),
    currentPeriodEnd: typeof currentEnd === 'number' && currentEnd > 0 ? currentEnd * 1000 : null,
  };
}

/** Absolute status write. An older event does not overwrite a newer one. */
export function applyParsedBillingEvent(
  state: TeacherBillingRecord,
  event: ParsedBillingEvent,
): TeacherBillingRecord {
  if (!event.status || event.createdAtMs < state.lastEventAt) return state;
  return {
    ...state,
    status: event.status,
    razorpaySubscriptionId: event.subscriptionId ?? state.razorpaySubscriptionId,
    razorpayPlanId: event.planId ?? state.razorpayPlanId,
    currentPeriodEnd: event.currentPeriodEnd ?? state.currentPeriodEnd,
    cancelAtPeriodEnd: event.status === 'cancelled' ? false : state.cancelAtPeriodEnd,
    lastEventAt: event.createdAtMs,
    updatedAt: event.createdAtMs,
  };
}

export function withCreatedSubscription(
  state: TeacherBillingRecord,
  subscriptionId: string,
  planId: string,
  now: number,
): TeacherBillingRecord {
  return {
    ...state,
    status:
      state.status === 'active' || state.status === 'authenticated' ? state.status : 'created',
    razorpaySubscriptionId: subscriptionId,
    razorpayPlanId: planId,
    updatedAt: now,
  };
}
