import { isBillingEnabled } from '@/lib/config/feature-flags';

/** New lessons one teacher may start per UTC day while billing is off. */
export const DEFAULT_FREE_LESSON_DAILY_CAP = 100;

export const FREE_LESSON_LIMIT_MESSAGE =
  "Today's free lesson limit has been reached. Try again tomorrow. Lessons you already have can still be opened and taught.";

export const BILLING_OFF_MESSAGE = 'Billing is turned off. Lessons are free for now.';

const usage = new Map<string, { day: string; count: number }>();

/**
 * `FREE_LESSON_DAILY_CAP` while billing is off. Unset uses the default.
 * `0` removes the cap. Any other non-integer falls back to the default.
 * The count lives in this server process. It is not a chalk balance.
 */
export function freeLessonDailyCap(): number {
  const raw = process.env.FREE_LESSON_DAILY_CAP;
  if (raw === undefined || raw.trim() === '') return DEFAULT_FREE_LESSON_DAILY_CAP;
  if (!/^\d+$/.test(raw.trim())) return DEFAULT_FREE_LESSON_DAILY_CAP;
  return Number(raw.trim());
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** True when this lesson start is still inside the free daily cap. */
export function takeFreeLessonSlot(uid: string, now = Date.now()): boolean {
  const cap = freeLessonDailyCap();
  if (cap === 0) return true;
  const day = utcDay(now);
  if (usage.size > 5000) {
    for (const [key, entry] of usage) {
      if (entry.day !== day) usage.delete(key);
    }
  }
  const current = usage.get(uid);
  if (!current || current.day !== day) {
    usage.set(uid, { day, count: 1 });
    return true;
  }
  if (current.count >= cap) return false;
  current.count += 1;
  return true;
}

export function resetFreeLessonUsage(): void {
  usage.clear();
}

/** Checkout and school billing routes answer this while the switch is off. */
export function billingOffResponse(): Response | null {
  if (isBillingEnabled()) return null;
  return Response.json({ ok: false, error: BILLING_OFF_MESSAGE }, { status: 404 });
}
