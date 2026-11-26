import { z } from 'zod';

import { authError, authServerFailure } from '@/lib/server/auth/api-response';
import { isSameOriginMutation } from '@/lib/server/auth/request-security';
import { createTeacherSession, teacherSessionCookie } from '@/lib/server/auth/session';
import { StudentSignInError } from '@/lib/server/student/account';

export const runtime = 'nodejs';
const schema = z.object({
  idToken: z.string().min(100).max(20_000),
  role: z.enum(['teacher', 'student']).optional(),
  ageConfirmed: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request))
    return authError('FORBIDDEN', 403, 'This sign-in request was not accepted.');
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return authError('INVALID_CREDENTIALS', 401, 'Google sign-in could not be verified.');
  try {
    const session = await createTeacherSession(parsed.data.idToken, {
      role: parsed.data.role,
      ageConfirmed: parsed.data.ageConfirmed,
    });
    return Response.json(
      {
        ok: true,
        user: session.user,
        ...(session.role ? { role: session.role } : {}),
        ...(session.notice ? { notice: session.notice } : {}),
      },
      { headers: { 'Set-Cookie': teacherSessionCookie(session.token) } },
    );
  } catch (error) {
    if (error instanceof StudentSignInError) {
      return authError(
        'FORBIDDEN',
        403,
        'OrbitTeach cannot open a student account unless you confirm you are 13 or older. This launch does not sign up younger learners.',
      );
    }
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (/id-token|session-cookie|user-disabled|argument-error/.test(code)) {
      return authError('INVALID_CREDENTIALS', 401, 'Google sign-in could not be verified.');
    }
    return authServerFailure('Firebase sign-in', error);
  }
}
