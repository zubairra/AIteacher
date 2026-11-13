import { settleLessonChalk } from '@/lib/server/billing/store';

const lessonHolds = new WeakMap<object, { uid: string; holdId: string } | 'skip'>();

export function rememberLessonHold(
  request: object,
  hold: { uid: string; holdId: string } | 'skip',
): void {
  lessonHolds.set(request, hold);
}

export async function settleLessonGeneration(request: object, success: boolean): Promise<void> {
  const hold = lessonHolds.get(request);
  if (!hold || hold === 'skip') return;
  lessonHolds.delete(request);
  await settleLessonChalk(hold.uid, hold.holdId, success);
}
