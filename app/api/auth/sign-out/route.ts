import { isSameOriginMutation } from '@/lib/server/auth/request-security';
import { authError, authServerFailure } from '@/lib/server/auth/api-response';
import { clearTeacherSessionCookie } from '@/lib/server/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return authError('FORBIDDEN', 403, 'This sign-out request was not accepted.');
  }
  try {
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearTeacherSessionCookie() } });
  } catch (error) {
    return authServerFailure('sign-out', error);
  }
}
