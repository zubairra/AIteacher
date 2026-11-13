import { randomUUID } from 'node:crypto';

import { apiError } from '@/lib/server/api-response';
import { rememberLessonHold } from '@/lib/server/billing/lesson-chalk';
import { ensureTeacherTrial, reserveLessonChalk } from '@/lib/server/billing/store';
import { resolveTeacherProviderCredential } from '@/lib/server/auth/credential-vault';
import { ProviderSetupError } from '@/lib/server/provider-setup-error';
import { resolveTeacherSessionRequest } from '@/lib/server/auth/session';
import { CHALK_PLANS, isTeacherEntitled, OUT_OF_CHALKS_MESSAGE } from '@/lib/teacher/billing';

/**
 * One chalk is spent only when a new lesson finishes generating. The hold is
 * taken first so two requests cannot spend the same chalk, and it is returned
 * if that attempt fails.
 */
export async function requireTeacherGeneration(
  request: Pick<Request, 'headers'> & object,
  options?: { lesson?: boolean },
): Promise<Response | null> {
  const teacher = await resolveTeacherSessionRequest(request);
  if (!teacher) {
    return apiError('UNAUTHENTICATED', 401, 'Sign in to generate a lesson.');
  }
  try {
    const ownKey = await teacherUsesOwnKey(teacher.id);
    if (options?.lesson) {
      if (ownKey && !CHALK_PLANS.ownKeyConsumesChalk) {
        rememberLessonHold(request, 'skip');
        return null;
      }
      await ensureTeacherTrial(teacher.id);
      const holdId = randomUUID();
      const reserved = await reserveLessonChalk(teacher.id, holdId);
      if (reserved === 'denied') {
        return apiError('SUBSCRIPTION_REQUIRED', 402, OUT_OF_CHALKS_MESSAGE);
      }
      rememberLessonHold(request, { uid: teacher.id, holdId });
      return null;
    }
    if (ownKey && !CHALK_PLANS.ownKeyConsumesChalk) return null;
    const billing = await ensureTeacherTrial(teacher.id);
    if (!isTeacherEntitled(billing, Date.now()) && !billing.schoolId) {
      return apiError('SUBSCRIPTION_REQUIRED', 402, OUT_OF_CHALKS_MESSAGE);
    }
    return null;
  } catch {
    return apiError(
      'INTERNAL_ERROR',
      503,
      'Billing status could not be checked. Try again in a moment.',
    );
  }
}

export async function teacherSubscriptionGate(uid: string): Promise<Response | null> {
  try {
    if ((await teacherUsesOwnKey(uid)) && !CHALK_PLANS.ownKeyConsumesChalk) return null;
    const billing = await ensureTeacherTrial(uid);
    if (!isTeacherEntitled(billing, Date.now()) && !billing.schoolId) {
      return apiError('SUBSCRIPTION_REQUIRED', 402, OUT_OF_CHALKS_MESSAGE);
    }
    return null;
  } catch {
    return apiError(
      'INTERNAL_ERROR',
      503,
      'Billing status could not be checked. Try again in a moment.',
    );
  }
}

async function teacherUsesOwnKey(uid: string): Promise<boolean> {
  if (CHALK_PLANS.ownKeyConsumesChalk) return false;
  try {
    const credential = await resolveTeacherProviderCredential(uid);
    return Boolean(credential?.apiKey);
  } catch {
    return false;
  }
}

/** Turn a known setup failure into a structured response the UI can show. */
export function generationSetupResponse(error: unknown): Response | null {
  if (error instanceof ProviderSetupError) {
    return apiError(error.errorCode, error.status, error.message);
  }
  return null;
}
