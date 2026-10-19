import { apiError } from '@/lib/server/api-response';
import { ProviderSetupError } from '@/lib/server/provider-setup-error';
import { resolveTeacherSessionRequest } from '@/lib/server/auth/session';

/**
 * Lesson generation spends a model key. Anonymous callers are rejected even
 * when ACCESS_CODE is unset, so the owner's server key cannot be used by an
 * unauthenticated request.
 */
export async function requireTeacherGeneration(
  request: Pick<Request, 'headers'>,
): Promise<Response | null> {
  const teacher = await resolveTeacherSessionRequest(request);
  if (!teacher) {
    return apiError('UNAUTHENTICATED', 401, 'Sign in to generate a lesson.');
  }
  return null;
}

/** Turn a known setup failure into a structured response the UI can show. */
export function generationSetupResponse(error: unknown): Response | null {
  if (error instanceof ProviderSetupError) {
    return apiError(error.errorCode, error.status, error.message);
  }
  return null;
}
