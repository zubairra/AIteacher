import { resolveTeacherSessionRequest } from '@/lib/server/auth/session';
import { authError, authServerFailure } from '@/lib/server/auth/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await resolveTeacherSessionRequest(request);
    return user
      ? Response.json({ ok: true, authenticated: true, user })
      : authError('INVALID_CREDENTIALS', 401, 'Sign in is required.');
  } catch (error) {
    return authServerFailure('session lookup', error);
  }
}
