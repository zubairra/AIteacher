import { firebaseAdminDb } from '@/lib/server/firebase/admin';
import {
  applyParsedBillingEvent,
  emptyBilling,
  isBillingStatus,
  toTeacherBillingView,
  type ParsedBillingEvent,
  type TeacherBillingRecord,
  type TeacherBillingView,
} from '@/lib/teacher/billing';

function billingPath(uid: string): string {
  return `users/${uid}/billing/subscription`;
}

function eventPath(uid: string, eventId: string): string {
  return `users/${uid}/billingEvents/${eventId}`;
}

function indexPath(subscriptionId: string): string {
  return `billingIndex/${subscriptionId}`;
}

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function billingRecordFromData(
  uid: string,
  data: Record<string, unknown> | undefined,
): TeacherBillingRecord | null {
  if (!data) return null;
  const trialStartedAt = numberField(data.trialStartedAt);
  const trialEndsAt = numberField(data.trialEndsAt);
  if (trialStartedAt === null || trialEndsAt === null || !isBillingStatus(data.status)) return null;
  return {
    version: 1,
    ownerUid: uid,
    trialStartedAt,
    trialEndsAt,
    status: data.status,
    razorpaySubscriptionId:
      typeof data.razorpaySubscriptionId === 'string' ? data.razorpaySubscriptionId : null,
    razorpayPlanId: typeof data.razorpayPlanId === 'string' ? data.razorpayPlanId : null,
    currentPeriodEnd: numberField(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    lastEventAt: numberField(data.lastEventAt) ?? 0,
    updatedAt: numberField(data.updatedAt) ?? trialStartedAt,
  };
}

export async function readTeacherBilling(uid: string): Promise<TeacherBillingRecord | null> {
  const snap = await firebaseAdminDb().doc(billingPath(uid)).get();
  return billingRecordFromData(uid, snap.data());
}

export async function loadTeacherBillingView(uid: string): Promise<TeacherBillingView> {
  const now = Date.now();
  return toTeacherBillingView(await ensureTeacherTrial(uid, undefined, now), now);
}

/** Creates the 15-day trial once. A later sign-in does not move the start. */
export async function ensureTeacherTrial(
  uid: string,
  createdAtHint?: number,
  now = Date.now(),
): Promise<TeacherBillingRecord> {
  const db = firebaseAdminDb();
  const billingRef = db.doc(billingPath(uid));
  const profileRef = db.doc(`users/${uid}`);
  return db.runTransaction(async (tx) => {
    const billingSnap = await tx.get(billingRef);
    const existing = billingRecordFromData(uid, billingSnap.data());
    if (existing) return existing;
    let started = createdAtHint;
    if (started === undefined) {
      const profile = await tx.get(profileRef);
      const created = profile.data()?.createdAt;
      started = typeof created === 'number' ? created : now;
    }
    const record = emptyBilling(uid, started, now);
    tx.set(billingRef, record);
    return record;
  });
}

export async function rememberCreatedSubscription(
  uid: string,
  subscriptionId: string,
  planId: string,
  now = Date.now(),
): Promise<void> {
  const db = firebaseAdminDb();
  const current = (await readTeacherBilling(uid)) ?? emptyBilling(uid, now, now);
  if (current.status === 'active' || current.status === 'authenticated') {
    throw new Error('ALREADY_SUBSCRIBED');
  }
  const next = {
    ...current,
    status: 'created' as const,
    razorpaySubscriptionId: subscriptionId,
    razorpayPlanId: planId,
    cancelAtPeriodEnd: false,
    updatedAt: now,
  };
  const batch = db.batch();
  batch.set(db.doc(billingPath(uid)), next);
  batch.set(db.doc(indexPath(subscriptionId)), { uid, planId, createdAt: now });
  await batch.commit();
}

export async function markCancelScheduled(uid: string, now = Date.now()): Promise<void> {
  await firebaseAdminDb()
    .doc(billingPath(uid))
    .set({ cancelAtPeriodEnd: true, updatedAt: now }, { merge: true });
}

export async function resolveBillingUid(event: ParsedBillingEvent): Promise<string | null> {
  const db = firebaseAdminDb();
  if (event.uid) {
    const snap = await db.doc(billingPath(event.uid)).get();
    if (snap.exists) return event.uid;
  }
  if (!event.subscriptionId) return null;
  const index = await db.doc(indexPath(event.subscriptionId)).get();
  const uid = index.data()?.uid;
  return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? uid : null;
}

export async function applyBillingWebhook(
  uid: string,
  eventId: string,
  event: ParsedBillingEvent,
): Promise<'applied' | 'duplicate' | 'ignored'> {
  const db = firebaseAdminDb();
  const eventRef = db.doc(eventPath(uid, eventId));
  const billingRef = db.doc(billingPath(uid));
  return db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return 'duplicate';
    const billingSnap = await tx.get(billingRef);
    const current = billingRecordFromData(uid, billingSnap.data());
    if (!current) return 'ignored';
    if (!event.status) {
      tx.set(eventRef, { name: event.name, appliedAt: Date.now() });
      return 'ignored';
    }
    const next = applyParsedBillingEvent(current, event);
    tx.set(billingRef, next);
    tx.set(eventRef, { name: event.name, appliedAt: Date.now() });
    return next === current ? 'ignored' : 'applied';
  });
}
