export interface QuotaSnapshot {
  day: string;
  count: number;
}

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function parseDailyCap(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^\d+$/.test(raw.trim())) return fallback;
  return Number(raw.trim());
}

export const DEFAULT_STUDENT_TUTOR_DAILY_CAP = 40;
export const DEFAULT_STUDENT_TUTOR_GLOBAL_DAILY_CAP = 2000;

export function studentTutorDailyCap(): number {
  return parseDailyCap(process.env.STUDENT_TUTOR_DAILY_CAP, DEFAULT_STUDENT_TUTOR_DAILY_CAP);
}

export function studentTutorGlobalDailyCap(): number {
  return parseDailyCap(
    process.env.STUDENT_TUTOR_GLOBAL_DAILY_CAP,
    DEFAULT_STUDENT_TUTOR_GLOBAL_DAILY_CAP,
  );
}

export interface QuotaSlotPlan {
  id: string;
  current: QuotaSnapshot | null;
  cap: number;
}

export interface QuotaPlan {
  status: 'ok' | 'limited';
  limitedId?: string;
  /** Present only when the reservation is allowed and should be written. */
  next: Record<string, QuotaSnapshot>;
}

/**
 * All-or-nothing daily counters. A cap of 0 means unlimited and does not increment.
 * A blocked slot does not change any counter.
 */
export function planQuotaReservation(day: string, slots: QuotaSlotPlan[]): QuotaPlan {
  const next: Record<string, QuotaSnapshot> = {};
  for (const slot of slots) {
    const count = slot.current && slot.current.day === day ? slot.current.count : 0;
    if (slot.cap !== 0 && count >= slot.cap) {
      return { status: 'limited', limitedId: slot.id, next: {} };
    }
    next[slot.id] = { day, count: slot.cap === 0 ? count : count + 1 };
  }
  return { status: 'ok', next };
}

export function planQuotaRelease(
  day: string,
  slots: { id: string; current: QuotaSnapshot | null }[],
): Record<string, QuotaSnapshot> {
  const next: Record<string, QuotaSnapshot> = {};
  for (const slot of slots) {
    if (!slot.current || slot.current.day !== day || slot.current.count <= 0) continue;
    next[slot.id] = { day, count: slot.current.count - 1 };
  }
  return next;
}
