import { apiError } from '@/lib/server/api-response';
import { isSameOriginMutation } from '@/lib/server/auth/request-security';
import { resolveTeacherSessionRequest } from '@/lib/server/auth/session';
import {
  inviteSchoolTeacher,
  readSchoolForAdmin,
  removeSchoolTeacher,
} from '@/lib/server/billing/store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await resolveTeacherSessionRequest(request);
  if (!user) return apiError('UNAUTHENTICATED', 401, 'Sign in to manage a school.');
  const school = await readSchoolForAdmin(user.id);
  if (!school) return Response.json({ ok: true, school: null });
  return Response.json({ ok: true, school });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return apiError('FORBIDDEN', 403, 'This request was not accepted.');
  }
  const user = await resolveTeacherSessionRequest(request);
  if (!user) return apiError('UNAUTHENTICATED', 401, 'Sign in to manage a school.');
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    email?: unknown;
    uid?: unknown;
  } | null;
  if (body?.action === 'invite' && typeof body.email === 'string') {
    const result = await inviteSchoolTeacher(user.id, body.email);
    if (result === 'invalid')
      return apiError('INVALID_REQUEST', 400, 'Enter a teacher email address.');
    if (result === 'forbidden') {
      return apiError('FORBIDDEN', 403, 'Only the school admin can invite teachers.');
    }
    if (result === 'full') return apiError('INVALID_REQUEST', 409, 'Every seat is already in use.');
    return Response.json({ ok: true });
  }
  if (body?.action === 'remove' && typeof body.uid === 'string') {
    const removed = await removeSchoolTeacher(user.id, body.uid);
    if (!removed) return apiError('FORBIDDEN', 403, 'That teacher could not be removed.');
    return Response.json({ ok: true });
  }
  return apiError('INVALID_REQUEST', 400, 'Choose invite or remove.');
}
