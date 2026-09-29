import { z } from 'zod';

import { authError, authServerFailure } from '@/lib/server/auth/api-response';
import { isSameOriginMutation } from '@/lib/server/auth/request-security';
import { createTeacherSession, teacherSessionCookie } from '@/lib/server/auth/session';

export const runtime = 'nodejs';
const schema = z.object({ idToken: z.string().min(100).max(20_000) });

export async function POST(request: Request) {
  if (!isSameOriginMutation(request))
    return authError('FORBIDDEN', 403, 'This sign-in request was not accepted.');
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return authError('INVALID_CREDENTIALS', 401, 'Google sign-in could not be verified.');
  try {
    const { token, user } = await createTeacherSession(parsed.data.idToken);
    return Response.json(
      { ok: true, user },
      { headers: { 'Set-Cookie': teacherSessionCookie(token) } },
    );
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (/id-token|session-cookie|user-disabled|argument-error/.test(code)) {
      return authError('INVALID_CREDENTIALS', 401, 'Google sign-in could not be verified.');
    }
    return authServerFailure('Firebase sign-in', error);
  }
}
