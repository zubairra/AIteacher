/**
 * India teacher plans. Change prices and chalk allowances here only.
 *
 * These numbers are unused while `BILLING_ENABLED` is off (the default).
 * Teachers generate lessons for free until that switch is `true` or `1`.
 * See `isBillingEnabled` in `lib/config/feature-flags.ts`.
 *
 * Amounts are paise (₹99 = 9900).
 *
 * One chalk is one new AI-generated lesson. A lesson that fails does not spend
 * a chalk. Retries inside that same attempt do not spend another. Included
 * chalks refill every 7 days from the plan start and do not roll over. The
 * bill stays monthly for Pro and Max and yearly for School. Top-up chalks
 * stay until they are used.
 *
 * Margin, if every weekly chalk is used across four refills in a billing
 * month. AI cost is about ₹3 a lesson. GST is 18%. Razorpay is about 2.4%.
 * Kept ≈ price/1.18 − price×0.024 − chalks×₹3:
 * - Pro ₹99 / 5 a week (20 in four weeks) ≈ ₹21.52
 * - Max ₹499 / 30 a week (120 in four weeks) ≈ ₹50.90
 * - School ₹89 / 4 a seat a week (16 in four weeks) ≈ ₹25.28
 * - Top-up ₹399 / 100 chalks ≈ ₹28.56
 * A 31-day span can contain five refills. That still keeps Max and the top-up
 * above ₹20, and drops Pro to about ₹6.50 and School to about ₹13.
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
  /**
   * Trial grants this many chalks at the start and again every 7 days while
   * the 15 days last. That is at most three grants (15 chalks). Unused chalks
   * from one week do not carry into the next.
   */
  trial: { days: 15, chalksPerWeek: 5 },
  pro: {
    pricePaise: 9900,
    chalksPerWeek: 5,
    period: 'monthly' as const,
    interval: 1,
    cycleCount: 120,
    name: 'SmartBoard AI Pro',
  },
  max: {
    pricePaise: 49900,
    chalksPerWeek: 30,
    period: 'monthly' as const,
    interval: 1,
    cycleCount: 120,
    name: 'SmartBoard AI Max',
  },
  school: {
    pricePaisePerSeatPerMonth: 8900,
    annualPaisePerSeat: 1_068_00,
    minSeats: 10,
    chalksPerSeatPerWeek: 4,
    pilotDays: 30,
    period: 'yearly' as const,
    interval: 1,
    cycleCount: 10,
    name: 'SmartBoard AI School',
  },
  topUp: { pricePaise: 39900, chalks: 100, name: '100 chalks' },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
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
export type ChalkSource = 'weekly' | 'topup' | 'school';

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
  /** Included chalks left in the current 7-day window. */
  weeklyChalks: number;
  /** Start of the rolling week. Trial uses the first sign-in. Paid plans use the subscription start. */
  chalkPeriodStart: number;
  /** How many full weeks have already been granted from chalkPeriodStart. */
  chalkWindow: number;
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
  chalkPeriodStart: number | null;
  chalkWindow: number;
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
  weeklyChalks: number;
  topUpChalks: number;
  nextRefreshAt: number | null;
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

export function weeklyChalksFor(plan: TeacherPlanId): number {
  if (plan === 'trial') return CHALK_PLANS.trial.chalksPerWeek;
  if (plan === 'pro') return CHALK_PLANS.pro.chalksPerWeek;
  if (plan === 'max') return CHALK_PLANS.max.chalksPerWeek;
  return 0;
}

export function schoolPoolAllowance(seatCount: number): number {
  return Math.max(0, seatCount) * CHALK_PLANS.school.chalksPerSeatPerWeek;
}

export function chalkWindowIndex(anchor: number, now: number): number {
  if (now <= anchor) return 0;
  return Math.floor((now - anchor) / WEEK_MS);
}

export function nextChalkRefreshAt(anchor: number, now: number): number {
  return anchor + (chalkWindowIndex(anchor, now) + 1) * WEEK_MS;
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
    weeklyChalks: CHALK_PLANS.trial.chalksPerWeek,
    chalkPeriodStart: start,
    chalkWindow: 0,
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

function includedChalksActive(record: TeacherBillingRecord, now: number): boolean {
  if (record.plan === 'trial') return now < record.trialEndsAt;
  if (record.plan === 'pro' || record.plan === 'max') return PAID_ACCESS.has(record.status);
  return false;
}

/**
 * Grant a fresh weekly allowance when 7 days have passed since the anchor.
 * Unused chalks from the previous week are discarded. Top-ups are not touched.
 */
export function refreshWeeklyChalks(
  record: TeacherBillingRecord,
  now: number,
): TeacherBillingRecord {
  const anchor = record.chalkPeriodStart || record.trialStartedAt;
  const index = chalkWindowIndex(anchor, now);
  if (!includedChalksActive(record, now)) {
    if (record.weeklyChalks === 0 && record.chalkWindow === index) return record;
    return {
      ...record,
      chalkPeriodStart: anchor,
      chalkWindow: index,
      weeklyChalks: 0,
      updatedAt: now,
    };
  }
  if (index === record.chalkWindow) return record;
  return {
    ...record,
    chalkPeriodStart: anchor,
    chalkWindow: index,
    weeklyChalks: weeklyChalksFor(record.plan),
    updatedAt: now,
  };
}

export function refreshSchoolPool(pool: SchoolChalkPool, now: number): SchoolChalkPool {
  if (pool.status === 'pilot' && pool.pilotEndsAt !== null && now >= pool.pilotEndsAt) {
    return { ...pool, status: 'cancelled', poolChalks: 0 };
  }
  if (pool.status === 'cancelled' || pool.chalkPeriodStart === null) return pool;
  const index = chalkWindowIndex(pool.chalkPeriodStart, now);
  if (index === pool.chalkWindow) return pool;
  return { ...pool, chalkWindow: index, poolChalks: schoolPoolAllowance(pool.seatCount) };
}

export function chalksRemaining(
  record: TeacherBillingRecord,
  school?: SchoolChalkPool | null,
): number {
  const personal = record.weeklyChalks + record.topUpChalks;
  if (!school || school.status === 'cancelled') return personal;
  return school.poolChalks + record.topUpChalks;
}

export function isTeacherEntitled(record: TeacherBillingRecord, now: number): boolean {
  const current = refreshWeeklyChalks(record, now);
  if (now < current.trialEndsAt && current.plan === 'trial') return true;
  if (PAID_ACCESS.has(current.status) && current.plan !== 'trial' && current.plan !== 'none') {
    return true;
  }
  return current.weeklyChalks + current.topUpChalks > 0;
}

export function canStartLesson(
  record: TeacherBillingRecord,
  now: number,
  options: { ownKey?: boolean; school?: SchoolChalkPool | null } = {},
): boolean {
  if (options.ownKey && !CHALK_PLANS.ownKeyConsumesChalk) return true;
  const current = refreshWeeklyChalks(record, now);
  const school = options.school ? refreshSchoolPool(options.school, now) : null;
  return chalksRemaining(current, school) > 0;
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

export function formatChalkRefresh(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).formatToParts(new Date(ms));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const minute = pick('minute').padStart(2, '0');
  return `${pick('weekday')} ${pick('hour')}:${minute} ${pick('dayPeriod').toUpperCase()}`;
}

export function chalksLeftLabel(count: number, refreshAt: number | null = null): string {
  const refill = refreshAt ? `, refills ${formatChalkRefresh(refreshAt)}` : '';
  if (count <= 0) return refreshAt ? `Out of chalks${refill}` : 'Out of chalks';
  const noun = count === 1 ? 'chalk' : 'chalks';
  return `${count} ${noun} left${refill}`;
}

export function subscriptionStartAtUnix(trialEnd: number, now: number): number | null {
  if (trialEnd - now < SUBSCRIPTION_START_DELAY_MS) return null;
  return Math.floor(trialEnd / 1000);
}

/**
 * Remember the paid plan and its billing date. The weekly chalk window is
 * anchored once, when the plan starts. Later renewal webhooks do not refill it.
 */
export function anchorPaidPlan(
  record: TeacherBillingRecord,
  plan: Exclude<TeacherPlanId, 'trial' | 'none' | 'school'>,
  periodEnd: number | null,
  now: number,
): TeacherBillingRecord {
  const sameWindow = record.plan === plan && record.chalkPeriodStart > 0;
  return {
    ...record,
    plan,
    status: 'active',
    weeklyChalks: sameWindow ? record.weeklyChalks : weeklyChalksFor(plan),
    chalkPeriodStart: sameWindow ? record.chalkPeriodStart : now,
    chalkWindow: sameWindow ? record.chalkWindow : 0,
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
  if (hold.source === 'weekly') return { ...record, weeklyChalks: record.weeklyChalks + 1 };
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
  const fresh = refreshWeeklyChalks(record, now);
  const expiredHolds = fresh.openHolds.filter((hold) => now - hold.at >= CHALK_HOLD_TTL_MS);
  let current = fresh;
  let pool = school ? refreshSchoolPool(school, now) : null;
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
  } else if (current.weeklyChalks > 0) {
    source = 'weekly';
    current = { ...current, weeklyChalks: current.weeklyChalks - 1 };
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
  if (record.weeklyChalks + record.topUpChalks <= 0 && phase !== 'active') return 'Out of chalks';
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
  const current = refreshWeeklyChalks(record, now);
  const refreshedSchool = school ? refreshSchoolPool(school, now) : null;
  const entitled = isTeacherEntitled(current, now);
  const paid =
    PAID_ACCESS.has(current.status) && current.plan !== 'trial' && current.plan !== 'none';
  const phase: TeacherBillingView['phase'] =
    paid || current.plan === 'school' ? 'active' : entitled ? 'trial' : 'expired';
  const daysLeft = trialDaysLeft(current, now);
  const chalksLeft = chalksRemaining(current, refreshedSchool);
  const refreshAnchor = refreshedSchool?.chalkPeriodStart ?? current.chalkPeriodStart;
  const refreshAt =
    refreshAnchor &&
    (current.plan !== 'trial' || nextChalkRefreshAt(refreshAnchor, now) < current.trialEndsAt)
      ? nextChalkRefreshAt(refreshAnchor, now)
      : null;
  const priceLabel = formatInr(CHALK_PLANS.pro.pricePaise);
  const nextBillingDate = current.currentPeriodEnd
    ? formatIndiaDate(current.currentPeriodEnd)
    : null;
  const trialEndLabel = formatIndiaDate(current.trialEndsAt);
  const dayWord = daysLeft === 1 ? 'day' : 'days';
  const chalkWord = chalksLeft === 1 ? 'chalk' : 'chalks';
  let headline = `Free trial · ${daysLeft} ${dayWord} left`;
  let detail = `${chalksLeftLabel(chalksLeft, refreshAt)}. Then choose Pro or Max. No card is needed during the trial.`;
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
      ? `You can keep generating lessons until ${nextBillingDate ?? 'the end of this period'}. Unused weekly chalks do not roll over.`
      : nextBillingDate
        ? `Next bill on ${nextBillingDate}. Unused weekly chalks do not roll over. Top-up chalks stay until you use them.`
        : 'Unused weekly chalks do not roll over. Top-up chalks stay until you use them.';
  }
  return {
    entitled,
    canStartLesson: canStartLesson(current, now, { school: refreshedSchool }),
    phase,
    plan: current.plan,
    daysLeft,
    chalksLeft,
    chalksLabel: chalksLeftLabel(chalksLeft, refreshAt),
    weeklyChalks:
      refreshedSchool && refreshedSchool.status !== 'cancelled'
        ? refreshedSchool.poolChalks
        : current.weeklyChalks,
    topUpChalks: current.topUpChalks,
    nextRefreshAt: refreshAt,
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
    next = anchorPaidPlan(next, plan, next.currentPeriodEnd, event.createdAtMs);
  }
  if (event.status === 'past_due' || event.status === 'halted' || event.status === 'cancelled') {
    next = { ...next, weeklyChalks: 0 };
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
