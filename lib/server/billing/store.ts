import { firebaseAdminDb } from '@/lib/server/firebase/admin';
import {
  applyParsedBillingEvent,
  CHALK_PLANS,
  emptyBilling,
  isBillingStatus,
  isTeacherPlanId,
  reserveChalk,
  schoolPoolAllowance,
  settleChalk,
  toTeacherBillingView,
  type ChalkHold,
  type ParsedBillingEvent,
  type SchoolChalkPool,
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
    plan: isTeacherPlanId(data.plan) ? data.plan : 'trial',
    monthlyChalks:
      numberField(data.monthlyChalks) ?? (trialEndsAt > Date.now() ? CHALK_PLANS.trial.chalks : 0),
    topUpChalks: numberField(data.topUpChalks) ?? 0,
    schoolId: typeof data.schoolId === 'string' ? data.schoolId : null,
    openHolds: parseHolds(data.openHolds),
  };
}

function parseHolds(value: unknown): ChalkHold[] {
  if (!Array.isArray(value)) return [];
  const holds: ChalkHold[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const hold = item as Partial<ChalkHold>;
    if (typeof hold.id !== 'string' || typeof hold.at !== 'number') continue;
    if (hold.source !== 'monthly' && hold.source !== 'topup' && hold.source !== 'school') continue;
    holds.push({
      id: hold.id,
      at: hold.at,
      source: hold.source,
      schoolId: typeof hold.schoolId === 'string' ? hold.schoolId : null,
    });
  }
  return holds;
}

function schoolPath(schoolId: string): string {
  return `schools/${schoolId}`;
}

function schoolPoolFromData(data: Record<string, unknown> | undefined): SchoolChalkPool | null {
  if (!data) return null;
  const status = data.status;
  if (status !== 'pilot' && status !== 'active' && status !== 'cancelled') return null;
  return {
    seatCount: numberField(data.seatCount) ?? 0,
    poolChalks: numberField(data.poolChalks) ?? 0,
    status,
    pilotEndsAt: numberField(data.pilotEndsAt),
    periodEnd: numberField(data.periodEnd),
  };
}

export async function readTeacherBilling(uid: string): Promise<TeacherBillingRecord | null> {
  const snap = await firebaseAdminDb().doc(billingPath(uid)).get();
  return billingRecordFromData(uid, snap.data());
}

export async function loadTeacherBillingView(uid: string): Promise<TeacherBillingView> {
  const now = Date.now();
  const record = await ensureTeacherTrial(uid, undefined, now);
  let school = null;
  if (record.schoolId) {
    const snap = await firebaseAdminDb().doc(schoolPath(record.schoolId)).get();
    school = schoolPoolFromData(snap.data());
  }
  return toTeacherBillingView(record, now, school);
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
  plan: 'pro' | 'max' | 'school' = 'pro',
): Promise<void> {
  const db = firebaseAdminDb();
  const current = (await readTeacherBilling(uid)) ?? emptyBilling(uid, now, now);
  if (current.status === 'active' || current.status === 'authenticated') {
    throw new Error('ALREADY_SUBSCRIBED');
  }
  const next = {
    ...current,
    status: 'created' as const,
    plan,
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
    const schoolRef = event.schoolId ? db.doc(schoolPath(event.schoolId)) : null;
    const schoolSnap = schoolRef ? await tx.get(schoolRef) : null;
    const billingSnap = await tx.get(billingRef);
    const current = billingRecordFromData(uid, billingSnap.data());
    if (!current) return 'ignored';
    if (!event.status && !event.topUp) {
      tx.set(eventRef, { name: event.name, appliedAt: Date.now() });
      return 'ignored';
    }
    const next = applyParsedBillingEvent(current, event);
    tx.set(billingRef, next);
    if (
      schoolRef &&
      event.plan === 'school' &&
      (event.status === 'active' || event.name === 'subscription.charged')
    ) {
      const seats =
        event.quantity ?? numberField(schoolSnap?.data()?.seatCount) ?? CHALK_PLANS.school.minSeats;
      tx.set(
        schoolRef,
        {
          poolChalks: schoolPoolAllowance(seats),
          seatCount: seats,
          status: 'active',
          periodEnd: event.currentPeriodEnd,
          adminUid: uid,
        },
        { merge: true },
      );
    }
    tx.set(eventRef, { name: event.name, appliedAt: Date.now() });
    return next === current ? 'ignored' : 'applied';
  });
}

export async function reserveLessonChalk(
  uid: string,
  holdId: string,
  now = Date.now(),
): Promise<'reserved' | 'denied'> {
  const db = firebaseAdminDb();
  const billingRef = db.doc(billingPath(uid));
  return db.runTransaction(async (tx) => {
    const billingSnap = await tx.get(billingRef);
    const current = billingRecordFromData(uid, billingSnap.data()) ?? emptyBilling(uid, now, now);
    const schoolRef = current.schoolId ? db.doc(schoolPath(current.schoolId)) : null;
    const usageRef = current.schoolId ? db.doc(`schools/${current.schoolId}/members/${uid}`) : null;
    const schoolSnap = schoolRef ? await tx.get(schoolRef) : null;
    const usageSnap = usageRef ? await tx.get(usageRef) : null;
    const school = schoolPoolFromData(schoolSnap?.data());
    const alreadyOpen = current.openHolds.some((hold) => hold.id === holdId);
    const reserved = reserveChalk(current, school, holdId, now);
    if (!reserved.ok || !reserved.hold) return 'denied';
    tx.set(billingRef, reserved.record);
    if (schoolRef && reserved.school) {
      tx.set(schoolRef, { poolChalks: reserved.school.poolChalks }, { merge: true });
    }
    if (usageRef && reserved.hold.source === 'school' && !alreadyOpen) {
      const used = numberField(usageSnap?.data()?.chalksUsedThisPeriod) ?? 0;
      tx.set(usageRef, { chalksUsedThisPeriod: used + 1 }, { merge: true });
    }
    return 'reserved';
  });
}

export async function settleLessonChalk(
  uid: string,
  holdId: string,
  success: boolean,
): Promise<void> {
  const db = firebaseAdminDb();
  const billingRef = db.doc(billingPath(uid));
  await db.runTransaction(async (tx) => {
    const billingSnap = await tx.get(billingRef);
    const current = billingRecordFromData(uid, billingSnap.data());
    if (!current) return;
    const hold = current.openHolds.find((item) => item.id === holdId);
    const schoolRef = current.schoolId ? db.doc(schoolPath(current.schoolId)) : null;
    const usageRef =
      !success && hold?.source === 'school' && current.schoolId
        ? db.doc(`schools/${current.schoolId}/members/${uid}`)
        : null;
    const schoolSnap = schoolRef ? await tx.get(schoolRef) : null;
    const usageSnap = usageRef ? await tx.get(usageRef) : null;
    const settled = settleChalk(current, schoolPoolFromData(schoolSnap?.data()), holdId, success);
    tx.set(billingRef, settled.record);
    if (schoolRef && settled.school) {
      tx.set(schoolRef, { poolChalks: settled.school.poolChalks }, { merge: true });
    }
    if (usageRef) {
      const used = numberField(usageSnap?.data()?.chalksUsedThisPeriod) ?? 0;
      tx.set(usageRef, { chalksUsedThisPeriod: Math.max(0, used - 1) }, { merge: true });
    }
  });
}

export async function readSchoolForAdmin(
  adminUid: string,
): Promise<Record<string, unknown> | null> {
  const db = firebaseAdminDb();
  const billing = await readTeacherBilling(adminUid);
  if (!billing?.schoolId) return null;
  const school = await db.doc(schoolPath(billing.schoolId)).get();
  if (!school.exists || school.data()?.adminUid !== adminUid) return null;
  const members = await db.collection(`schools/${billing.schoolId}/members`).get();
  return {
    id: billing.schoolId,
    ...school.data(),
    members: members.docs.map((item) => ({ uid: item.id, ...item.data() })),
  };
}

function inviteKey(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 120);
}

export async function inviteSchoolTeacher(
  adminUid: string,
  email: string,
): Promise<'invited' | 'full' | 'forbidden' | 'invalid'> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'invalid';
  const school = await readSchoolForAdmin(adminUid);
  if (!school || typeof school.id !== 'string') return 'forbidden';
  const db = firebaseAdminDb();
  const seats = numberField(school.seatCount) ?? 0;
  const members = Array.isArray(school.members) ? school.members.length : 0;
  const invites = await db.collection(`schools/${school.id}/invites`).get();
  const pending = invites.docs.filter((item) => item.data().status !== 'accepted').length;
  if (members + pending >= seats) return 'full';
  const key = inviteKey(email);
  const normalized = email.trim().toLowerCase();
  await db.doc(`schools/${school.id}/invites/${key}`).set({
    email: normalized,
    status: 'pending',
    invitedAt: Date.now(),
  });
  await db.doc(`schoolInvites/${key}`).set({ schoolId: school.id, email: normalized });
  return 'invited';
}

export async function removeSchoolTeacher(adminUid: string, memberUid: string): Promise<boolean> {
  const school = await readSchoolForAdmin(adminUid);
  if (!school || typeof school.id !== 'string' || memberUid === adminUid) return false;
  const db = firebaseAdminDb();
  await db.doc(`schools/${school.id}/members/${memberUid}`).delete();
  await db.doc(billingPath(memberUid)).set({ schoolId: null, plan: 'trial' }, { merge: true });
  return true;
}

export async function claimSchoolInvite(uid: string, email: string): Promise<void> {
  if (!email) return;
  const db = firebaseAdminDb();
  const key = inviteKey(email);
  const invite = await db.doc(`schoolInvites/${key}`).get();
  const schoolId = invite.data()?.schoolId;
  if (!invite.exists || typeof schoolId !== 'string') return;
  const billingRef = db.doc(billingPath(uid));
  const memberRef = db.doc(`schools/${schoolId}/members/${uid}`);
  const inviteRef = db.doc(`schools/${schoolId}/invites/${key}`);
  await db.runTransaction(async (tx) => {
    const billingSnap = await tx.get(billingRef);
    const current = billingRecordFromData(uid, billingSnap.data());
    if (!current || current.schoolId === schoolId) return;
    tx.set(memberRef, {
      email: email.trim().toLowerCase(),
      role: 'teacher',
      chalksUsedThisPeriod: 0,
    });
    tx.set(inviteRef, { status: 'accepted' }, { merge: true });
    tx.set(billingRef, { ...current, schoolId, plan: 'school', monthlyChalks: 0 });
  });
}

export async function grantSchoolPilot(input: {
  adminUid: string;
  name: string;
  seats: number;
  now?: number;
}): Promise<string> {
  const now = input.now ?? Date.now();
  const seats = Math.max(CHALK_PLANS.school.minSeats, input.seats);
  const schoolId = `school_${input.adminUid.slice(0, 8)}_${now.toString(36)}`;
  const db = firebaseAdminDb();
  const billing =
    (await readTeacherBilling(input.adminUid)) ?? emptyBilling(input.adminUid, now, now);
  await db.doc(schoolPath(schoolId)).set({
    adminUid: input.adminUid,
    name: input.name,
    seatCount: seats,
    status: 'pilot',
    pilotEndsAt: now + CHALK_PLANS.school.pilotDays * 24 * 60 * 60 * 1000,
    periodEnd: null,
    poolChalks: schoolPoolAllowance(seats),
  });
  await db.doc(`schools/${schoolId}/members/${input.adminUid}`).set({
    role: 'admin',
    chalksUsedThisPeriod: 0,
  });
  await db.doc(billingPath(input.adminUid)).set({
    ...billing,
    schoolId,
    plan: 'school',
    monthlyChalks: 0,
  });
  return schoolId;
}
