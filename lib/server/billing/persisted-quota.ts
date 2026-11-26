import type { Firestore } from 'firebase-admin/firestore';

import {
  planQuotaRelease,
  planQuotaReservation,
  type QuotaSnapshot,
  utcDay,
} from '@/lib/student/quota';
import { freeLessonDailyCap, takeFreeLessonSlot } from '@/lib/server/billing/free-mode';

export interface QuotaTxn {
  get(path: string): Promise<QuotaSnapshot | null>;
  set(path: string, value: QuotaSnapshot): void;
}

export interface QuotaTxnDb {
  runTransaction<T>(fn: (tx: QuotaTxn) => Promise<T>): Promise<T>;
}

export function firebaseQuotaDb(db: Firestore): QuotaTxnDb {
  return {
    runTransaction(fn) {
      return db.runTransaction(async (tx) => {
        const writes: { path: string; value: QuotaSnapshot }[] = [];
        const result = await fn({
          async get(path) {
            const snap = await tx.get(db.doc(path));
            if (!snap.exists) return null;
            const data = snap.data() ?? {};
            if (typeof data.day !== 'string' || typeof data.count !== 'number') return null;
            return { day: data.day, count: data.count };
          },
          set(path, value) {
            writes.push({ path, value });
          },
        });
        for (const write of writes) {
          tx.set(db.doc(write.path), write.value, { merge: true });
        }
        return result;
      });
    },
  };
}

export async function reserveQuotaPaths(
  db: QuotaTxnDb,
  day: string,
  slots: { id: string; path: string; cap: number }[],
): Promise<{ status: 'ok' | 'limited'; limitedId?: string }> {
  return db.runTransaction(async (tx) => {
    const current = [];
    for (const slot of slots) {
      current.push({ id: slot.id, cap: slot.cap, current: await tx.get(slot.path) });
    }
    const plan = planQuotaReservation(day, current);
    if (plan.status !== 'ok') return { status: 'limited' as const, limitedId: plan.limitedId };
    for (const slot of slots) {
      const next = plan.next[slot.id];
      if (next) tx.set(slot.path, next);
    }
    return { status: 'ok' as const };
  });
}

export async function releaseQuotaPaths(
  db: QuotaTxnDb,
  day: string,
  slots: { id: string; path: string }[],
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const current = [];
    for (const slot of slots) current.push({ id: slot.id, current: await tx.get(slot.path) });
    const next = planQuotaRelease(day, current);
    for (const slot of slots) {
      const value = next[slot.id];
      if (value) tx.set(slot.path, value);
    }
  });
}

/** Teacher lesson cap. Tests keep the in-memory counter; production writes Firestore. */
export async function consumeTeacherLessonAllowance(
  uid: string,
  now = Date.now(),
): Promise<boolean> {
  if (process.env.VITEST === 'true' && process.env.GENERATION_QUOTA_STORE !== 'firestore') {
    return takeFreeLessonSlot(uid, now);
  }
  const { firebaseAdminDb } = await import('@/lib/server/firebase/admin');
  const result = await reserveQuotaPaths(firebaseQuotaDb(firebaseAdminDb()), utcDay(now), [
    {
      id: 'actor',
      path: `users/${uid}/generationUsage/teacherLessons`,
      cap: freeLessonDailyCap(),
    },
  ]);
  return result.status === 'ok';
}
