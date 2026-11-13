/**
 * India teacher plans. Change prices and chalk allowances here only.
 * Amounts are paise (₹99 = 9900).
 *
 * One chalk is one new AI-generated lesson. A lesson that fails does not spend
 * a chalk. Retries inside that same attempt do not spend another. Monthly
 * chalks reset on the billing cycle and do not roll over. Top-up chalks stay
 * until they are used.
 *
 * Margin, worst case, if every included chalk is used. AI cost is about ₹3 a
 * lesson. GST is 18% of the sticker price. Razorpay is about 2.4%.
 * Kept ≈ price/1.18 − price×0.024 − chalks×₹3, and each paid plan stays
 * above ₹20 per teacher per month:
 * - Pro ₹99 / 20 chalks ≈ ₹21.52
 * - Max ₹499 / 130 chalks ≈ ₹20.91
 * - School ₹89 / 17 chalks ≈ ₹22.29
 * - Top-up ₹399 / 100 chalks ≈ ₹28.56
 *
 * Teachers who have saved their own provider key do not spend chalks when
 * `ownKeyConsumesChalk` is false. They pay their own model provider instead.
 */
export const CHALK_PLANS = {
  currency: 'INR' as const,
  ownKeyConsumesChalk: false,
  aiCostPaise: 300,
  gstRate: 0.18,
  razorpayFeeRate: 0.024,
  trial: { days: 15, chalks: 10 },
  pro: {
    pricePaise: 9900,
    chalksPerMonth: 20,
    period: 'monthly' as const,
    interval: 1,
    cycleCount: 120,
    name: 'SmartBoard AI Pro',
  },
  max: {
    pricePaise: 49900,
    chalksPerMonth: 130,
    period: 'monthly' as const,
    interval: 1,
    cycleCount: 120,
    name: 'SmartBoard AI Max',
  },
  school: {
    pricePaisePerSeatPerMonth: 8900,
    annualPaisePerSeat: 1_068_00,
    minSeats: 10,
    chalksPerSeatPerMonth: 17,
    pilotDays: 30,
    period: 'yearly' as const,
    interval: 1,
    cycleCount: 10,
    name: 'SmartBoard AI School',
  },
  topUp: { pricePaise: 39900, chalks: 100, name: '100 chalks' },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Razorpay rejects a subscription start_at that is sooner than this. */
export const SUBSCRIPTION_START_DELAY_MS = 15 * 60 * 1000;
/** A crashed lesson attempt returns its chalk after this long. */
export const CHALK_HOLD_TTL_MS = 15 * 60 * 1000;

export const OUT_OF_CHALKS_MESSAGE =
  'Out of chalks. Upgrade or top up to generate another lesson. You can still open and teach lessons you already have.';

export const SUBSCRIPTION_REQUIRED_MESSAGE = OUT_OF_CHALKS_MESSAGE;

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
export type TeacherPlanId = 'trial' | 'pro' | 'max' | 'school' | 'none';
export type ChalkSource = 'monthly' | 'topup' | 'school';

const PAID_ACCESS = new Set<BillingStatus>(['active', 'authenticated']);

export interface ChalkHold {
  id: string;
  at: number;
  source: ChalkSource;
  schoolId: string | null;
}

export interface TeacherBillingRecord {
  version: 1;
  ownerUid: string;
  trialStartedAt: number;
  trialEndsAt: number;
  status: BillingStatus;
  plan: TeacherPlanId;
  monthlyChalks: number;
  topUpChalks: number;
  schoolId: string | null;
  openHolds: readonly ChalkHold[];
  razorpaySubscriptionId: string | null;
  razorpayPlanId: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  lastEventAt: number;
  updatedAt: number;
}

export interface SchoolChalkPool {
  seatCount: number;
  poolChalks: number;
  status: 'pilot' | 'active' | 'cancelled';
  pilotEndsAt: number | null;
  periodEnd: number | null;
}

export interface TeacherBillingView {
  entitled: boolean;
  canStartLesson: boolean;
  phase: 'trial' | 'active' | 'expired';
  plan: TeacherPlanId;
  daysLeft: number;
  chalksLeft: number;
  chalksLabel: string;
  monthlyChalks: number;
  topUpChalks: number;
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
  orderId: string | null;
  uid: string | null;
  schoolId: string | null;
  plan: TeacherPlanId | null;
  quantity: number | null;
  topUp: boolean;
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

export function isTeacherPlanId(value: unknown): value is TeacherPlanId {
  return (
    value === 'trial' ||
    value === 'pro' ||
    value === 'max' ||
    value === 'school' ||
    value === 'none'
  );
}

export function trialEndsAt(startedAt: number): number {
  return startedAt + CHALK_PLANS.trial.days * DAY_MS;
}

export function monthlyChalksFor(plan: TeacherPlanId): number {
  if (plan === 'trial') return CHALK_PLANS.trial.chalks;
  if (plan === 'pro') return CHALK_PLANS.pro.chalksPerMonth;
  if (plan === 'max') return CHALK_PLANS.max.chalksPerMonth;
  return 0;
}

export function schoolPoolAllowance(seatCount: number): number {
  return Math.max(0, seatCount) * CHALK_PLANS.school.chalksPerSeatPerMonth;
}

/** Paise kept after GST, Razorpay, and the full chalk allowance at the AI cost. */
export function planMarginPaise(pricePaise: number, chalks: number): number {
  const net = pricePaise / (1 + CHALK_PLANS.gstRate);
  const fee = pricePaise * CHALK_PLANS.razorpayFeeRate;
  return net - fee - chalks * CHALK_PLANS.aiCostPaise;
}

export function emptyBilling(uid: string, startedAt: number, now: number): TeacherBillingRecord {
  const start = Math.min(startedAt, now);
  return {
    version: 1,
    ownerUid: uid,
    trialStartedAt: start,
    trialEndsAt: trialEndsAt(start),
    status: 'none',
    plan: 'trial',
    monthlyChalks: CHALK_PLANS.trial.chalks,
    topUpChalks: 0,
    schoolId: null,
    openHolds: [],
    razorpaySubscriptionId: null,
    razorpayPlanId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    lastEventAt: 0,
    updatedAt: now,
  };
}

/** Drop monthly chalks once the trial or paid period has ended. Top-ups stay. */
export function expireMonthlyChalks(
  record: TeacherBillingRecord,
  now: number,
): TeacherBillingRecord {
  const trialOver = record.plan === 'trial' && now >= record.trialEndsAt;
  const periodOver = record.currentPeriodEnd !== null && now >= record.currentPeriodEnd;
  if (!trialOver && !periodOver) return record;
  if (record.monthlyChalks === 0) return record;
  return { ...record, monthlyChalks: 0, updatedAt: now };
}

export function chalksRemaining(
  record: TeacherBillingRecord,
  school?: SchoolChalkPool | null,
): number {
  const personal = record.monthlyChalks + record.topUpChalks;
  if (!school || school.status === 'cancelled') return personal;
  return school.poolChalks + record.topUpChalks;
}

export function isTeacherEntitled(record: TeacherBillingRecord, now: number): boolean {
  const current = expireMonthlyChalks(record, now);
  if (now < current.trialEndsAt && current.plan === 'trial') return true;
  if (PAID_ACCESS.has(current.status) && current.plan !== 'trial' && current.plan !== 'none') {
    return true;
  }
  return current.monthlyChalks + current.topUpChalks > 0;
}

export function canStartLesson(
  record: TeacherBillingRecord,
  now: number,
  options: { ownKey?: boolean; school?: SchoolChalkPool | null } = {},
): boolean {
  if (options.ownKey && !CHALK_PLANS.ownKeyConsumesChalk) return true;
  const current = expireMonthlyChalks(record, now);
  return chalksRemaining(current, options.school) > 0;
}

export function trialDaysLeft(record: TeacherBillingRecord, now: number): number {
  if (now >= record.trialEndsAt) return 0;
  return Math.ceil((record.trialEndsAt - now) / DAY_MS);
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: CHALK_PLANS.currency,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatIndiaDate(ms: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(ms));
}

export function chalksLeftLabel(count: number): string {
  if (count <= 0) return 'Out of chalks';
  if (count === 1) return 'You have 1 chalk left';
  return `You have ${count} chalks left`;
}

export function subscriptionStartAtUnix(trialEnd: number, now: number): number | null {
  if (trialEnd - now < SUBSCRIPTION_START_DELAY_MS) return null;
  return Math.floor(trialEnd / 1000);
}

export function refillMonthlyChalks(
  record: TeacherBillingRecord,
  plan: Exclude<TeacherPlanId, 'trial' | 'none' | 'school'>,
  periodEnd: number | null,
  now: number,
): TeacherBillingRecord {
  return {
    ...record,
    plan,
    status: 'active',
    monthlyChalks: monthlyChalksFor(plan),
    currentPeriodEnd: periodEnd,
    lastEventAt: now,
    updatedAt: now,
  };
}

export function addTopUpChalks(
  record: TeacherBillingRecord,
  chalks: number,
  now: number,
): TeacherBillingRecord {
  return { ...record, topUpChalks: record.topUpChalks + chalks, updatedAt: now };
}

function releaseHold(record: TeacherBillingRecord, hold: ChalkHold): TeacherBillingRecord {
  if (hold.source === 'monthly') return { ...record, monthlyChalks: record.monthlyChalks + 1 };
  if (hold.source === 'topup') return { ...record, topUpChalks: record.topUpChalks + 1 };
  return record;
}

export interface ChalkReservation {
  record: TeacherBillingRecord;
  school: SchoolChalkPool | null;
  hold: ChalkHold | null;
  ok: boolean;
}

/** Spend one chalk or return the same state when this hold is already open. */
export function reserveChalk(
  record: TeacherBillingRecord,
  school: SchoolChalkPool | null,
  holdId: string,
  now: number,
): ChalkReservation {
  const fresh = expireMonthlyChalks(record, now);
  const expiredHolds = fresh.openHolds.filter((hold) => now - hold.at >= CHALK_HOLD_TTL_MS);
  let current = fresh;
  let pool = school;
  for (const hold of expiredHolds) {
    current = releaseHold(current, hold);
    if (hold.source === 'school' && pool) pool = { ...pool, poolChalks: pool.poolChalks + 1 };
  }
  const openHolds = current.openHolds.filter((hold) => now - hold.at < CHALK_HOLD_TTL_MS);
  const existing = openHolds.find((hold) => hold.id === holdId);
  if (existing) {
    return { record: { ...current, openHolds }, school: pool, hold: existing, ok: true };
  }
  let source: ChalkSource | null = null;
  if (pool && pool.status !== 'cancelled' && pool.poolChalks > 0) {
    source = 'school';
    pool = { ...pool, poolChalks: pool.poolChalks - 1 };
  } else if (current.monthlyChalks > 0) {
    source = 'monthly';
    current = { ...current, monthlyChalks: current.monthlyChalks - 1 };
  } else if (current.topUpChalks > 0) {
    source = 'topup';
    current = { ...current, topUpChalks: current.topUpChalks - 1 };
  }
  if (!source) return { record: { ...current, openHolds }, school: pool, hold: null, ok: false };
  const hold: ChalkHold = {
    id: holdId,
    at: now,
    source,
    schoolId: pool && source === 'school' ? current.schoolId : null,
  };
  return {
    record: { ...current, openHolds: [...openHolds, hold], updatedAt: now },
    school: pool,
    hold,
    ok: true,
  };
}

export function settleChalk(
  record: TeacherBillingRecord,
  school: SchoolChalkPool | null,
  holdId: string,
  success: boolean,
): { record: TeacherBillingRecord; school: SchoolChalkPool | null } {
  const hold = record.openHolds.find((item) => item.id === holdId);
  if (!hold) return { record, school };
  const openHolds = record.openHolds.filter((item) => item.id !== holdId);
  if (success) return { record: { ...record, openHolds }, school };
  const next = releaseHold({ ...record, openHolds }, hold);
  let pool = school;
  if (hold.source === 'school' && pool) pool = { ...pool, poolChalks: pool.poolChalks + 1 };
  return { record: next, school: pool };
}

export function recordSchoolUsage(
  usage: Readonly<Record<string, number>>,
  teacherId: string,
): Record<string, number> {
  return { ...usage, [teacherId]: (usage[teacherId] ?? 0) + 1 };
}

function statusLabel(record: TeacherBillingRecord, phase: TeacherBillingView['phase']): string {
  if (record.monthlyChalks + record.topUpChalks <= 0 && phase !== 'active') return 'Out of chalks';
  if (phase === 'trial') return 'Free trial';
  if (record.plan === 'pro') return 'Pro';
  if (record.plan === 'max') return 'Max';
  if (record.plan === 'school') return 'School';
  switch (record.status) {
    case 'active':
      return 'Active';
    case 'authenticated':
      return 'Payment authorised';
    case 'past_due':
      return 'Payment failed';
    case 'halted':
      return 'Payment halted';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Free trial';
  }
}

export function toTeacherBillingView(
  record: TeacherBillingRecord,
  now: number,
  school?: SchoolChalkPool | null,
): TeacherBillingView {
  const current = expireMonthlyChalks(record, now);
  const entitled = isTeacherEntitled(current, now);
  const paid =
    PAID_ACCESS.has(current.status) && current.plan !== 'trial' && current.plan !== 'none';
  const phase: TeacherBillingView['phase'] =
    paid || current.plan === 'school' ? 'active' : entitled ? 'trial' : 'expired';
  const daysLeft = trialDaysLeft(current, now);
  const chalksLeft = chalksRemaining(current, school);
  const priceLabel = formatInr(CHALK_PLANS.pro.pricePaise);
  const nextBillingDate = current.currentPeriodEnd
    ? formatIndiaDate(current.currentPeriodEnd)
    : null;
  const trialEndLabel = formatIndiaDate(current.trialEndsAt);
  const dayWord = daysLeft === 1 ? 'day' : 'days';
  const chalkWord = chalksLeft === 1 ? 'chalk' : 'chalks';
  let headline = `Free trial · ${daysLeft} ${dayWord} left`;
  let detail = `${chalksLeft} ${chalkWord} included. Then choose Pro or Max. No card is needed during the trial.`;
  if (chalksLeft <= 0 && phase !== 'active') {
    headline = 'Out of chalks';
    detail =
      'Upgrade or top up 100 chalks for ₹399 to generate another lesson. Lessons you already have can still be opened and taught.';
  } else if (phase === 'active') {
    const planName = current.plan === 'max' ? 'Max' : current.plan === 'school' ? 'School' : 'Pro';
    headline = current.cancelAtPeriodEnd
      ? 'Cancellation scheduled'
      : `${planName} · ${chalksLeft} ${chalkWord} left`;
    detail = current.cancelAtPeriodEnd
      ? `You can keep generating lessons until ${nextBillingDate ?? 'the end of this period'}. Monthly chalks do not roll over.`
      : nextBillingDate
        ? `Next bill on ${nextBillingDate}. Unused monthly chalks do not roll over. Top-up chalks stay until you use them.`
        : 'Unused monthly chalks do not roll over. Top-up chalks stay until you use them.';
  }
  return {
    entitled,
    canStartLesson: canStartLesson(current, now, { school }),
    phase,
    plan: current.plan,
    daysLeft,
    chalksLeft,
    chalksLabel: chalksLeftLabel(chalksLeft),
    monthlyChalks: current.monthlyChalks,
    topUpChalks: current.topUpChalks,
    priceLabel,
    statusLabel: statusLabel(current, phase),
    headline,
    detail,
    nextBillingDate: phase === 'trial' ? trialEndLabel : nextBillingDate,
    canSubscribe: current.plan !== 'pro' && current.plan !== 'max',
    canCancel: paid && !current.cancelAtPeriodEnd && Boolean(current.razorpaySubscriptionId),
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

function notesPlan(value: unknown): TeacherPlanId | null {
  if (!value || typeof value !== 'object') return null;
  const plan = (value as { plan?: unknown }).plan;
  return isTeacherPlanId(plan) ? plan : null;
}

function notesSchool(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const schoolId = (value as { schoolId?: unknown }).schoolId;
  return typeof schoolId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(schoolId) ? schoolId : null;
}

function notesTopUp(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (value as { kind?: unknown }).kind === 'chalk-topup';
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
  const order = entityOf(payload.order);
  const notes = subscription?.notes ?? order?.notes ?? payment?.notes;
  const createdAtSec = typeof record.created_at === 'number' ? record.created_at : 0;
  let status: BillingStatus | null = EVENT_STATUS[name] ?? null;
  if (name === 'subscription.updated') {
    const raw = text(subscription?.status);
    status = isBillingStatus(raw) ? raw : null;
  }
  const currentEnd = subscription?.current_end;
  const quantity = subscription?.quantity;
  const topUp = notesTopUp(notes) && (name === 'order.paid' || name === 'payment.captured');
  return {
    name,
    createdAtMs: createdAtSec > 0 ? createdAtSec * 1000 : now,
    subscriptionId: text(subscription?.id) ?? text(payment?.subscription_id),
    orderId: text(order?.id) ?? text(payment?.order_id),
    uid: notesUid(notes),
    schoolId: notesSchool(notes),
    plan: notesPlan(notes),
    quantity: typeof quantity === 'number' && quantity > 0 ? quantity : null,
    topUp,
    status: topUp ? null : status,
    planId: text(subscription?.plan_id),
    currentPeriodEnd: typeof currentEnd === 'number' && currentEnd > 0 ? currentEnd * 1000 : null,
  };
}

/** Absolute status write. An older event does not overwrite a newer one. */
export function applyParsedBillingEvent(
  state: TeacherBillingRecord,
  event: ParsedBillingEvent,
): TeacherBillingRecord {
  if (event.topUp) {
    if (event.createdAtMs < state.lastEventAt) return state;
    return addTopUpChalks(
      { ...state, lastEventAt: event.createdAtMs },
      CHALK_PLANS.topUp.chalks,
      event.createdAtMs,
    );
  }
  if (!event.status || event.createdAtMs < state.lastEventAt) return state;
  const plan =
    event.plan && event.plan !== 'trial' && event.plan !== 'none' ? event.plan : state.plan;
  let next: TeacherBillingRecord = {
    ...state,
    status: event.status,
    plan,
    razorpaySubscriptionId: event.subscriptionId ?? state.razorpaySubscriptionId,
    razorpayPlanId: event.planId ?? state.razorpayPlanId,
    currentPeriodEnd: event.currentPeriodEnd ?? state.currentPeriodEnd,
    cancelAtPeriodEnd: event.status === 'cancelled' ? false : state.cancelAtPeriodEnd,
    lastEventAt: event.createdAtMs,
    updatedAt: event.createdAtMs,
  };
  if (
    (event.status === 'active' || event.name === 'subscription.charged') &&
    (plan === 'pro' || plan === 'max')
  ) {
    next = refillMonthlyChalks(next, plan, next.currentPeriodEnd, event.createdAtMs);
  }
  if (event.status === 'past_due' || event.status === 'halted' || event.status === 'cancelled') {
    next = { ...next, monthlyChalks: 0 };
  }
  return next;
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

export function planIdEnv(plan: 'pro' | 'max' | 'school'): string | null {
  const name =
    plan === 'pro'
      ? process.env.RAZORPAY_PRO_PLAN_ID || process.env.RAZORPAY_PLAN_ID
      : plan === 'max'
        ? process.env.RAZORPAY_MAX_PLAN_ID
        : process.env.RAZORPAY_SCHOOL_PLAN_ID;
  const value = name?.trim();
  return value || null;
}
