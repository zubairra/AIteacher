import { apiError } from '@/lib/server/api-response';
import { ensureTeacherTrial } from '@/lib/server/billing/store';
import { ProviderSetupError } from '@/lib/server/provider-setup-error';
import { resolveTeacherSessionRequest } from '@/lib/server/auth/session';
import { isTeacherEntitled, SUBSCRIPTION_REQUIRED_MESSAGE } from '@/lib/teacher/billing';

/**
 * Lesson generation spends a model key. Anonymous callers are rejected even
 * when ACCESS_CODE is unset, so the owner's server key cannot be used by an
 * unauthenticated request. A signed-in teacher also needs an open trial or
 * an active subscription. The browser cannot skip this check.
 */
export async function requireTeacherGeneration(
  request: Pick<Request, 'headers'>,
): Promise<Response | null> {
  const teacher = await resolveTeacherSessionRequest(request);
  if (!teacher) {
    return apiError('UNAUTHENTICATED', 401, 'Sign in to generate a lesson.');
  }
  return teacherSubscriptionGate(teacher.id);
}

export async function teacherSubscriptionGate(uid: string): Promise<Response | null> {
  try {
    const billing = await ensureTeacherTrial(uid);
    if (!isTeacherEntitled(billing, Date.now())) {
      return apiError('SUBSCRIPTION_REQUIRED', 402, SUBSCRIPTION_REQUIRED_MESSAGE);
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

/** Turn a known setup failure into a structured response the UI can show. */
export function generationSetupResponse(error: unknown): Response | null {
  if (error instanceof ProviderSetupError) {
    return apiError(error.errorCode, error.status, error.message);
  }
  return null;
}
