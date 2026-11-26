import { apiError } from '@/lib/server/api-response';
import { isSameOriginMutation } from '@/lib/server/auth/request-security';
import { resolveTeacherSessionRequest, type TeacherSessionUser } from '@/lib/server/auth/session';
import {
  firebaseQuotaDb,
  releaseQuotaPaths,
  reserveQuotaPaths,
} from '@/lib/server/billing/persisted-quota';
import { readAccountRole } from '@/lib/server/student/account';
import { studentTutorDailyCap, studentTutorGlobalDailyCap, utcDay } from '@/lib/student/quota';

export async function requireStudentRequest(
  request: Request,
  mutation: boolean,
): Promise<TeacherSessionUser | Response> {
  const user = await resolveTeacherSessionRequest(request);
  if (!user) return apiError('UNAUTHENTICATED', 401, 'Sign in as a student.');
  if ((await readAccountRole(user.id)) !== 'student') {
    return apiError('FORBIDDEN', 403, 'This action is for student accounts.');
  }
  if (mutation && !isSameOriginMutation(request)) {
    return apiError('FORBIDDEN', 403, 'This request was not accepted.');
  }
  return user;
}

export async function requireTeacherRequest(
  request: Request,
): Promise<TeacherSessionUser | Response> {
  const user = await resolveTeacherSessionRequest(request);
  if (!user) return apiError('UNAUTHENTICATED', 401, 'Sign in as a teacher.');
  if ((await readAccountRole(user.id)) === 'student') {
    return apiError('FORBIDDEN', 403, 'Students cannot share lessons.');
  }
  if (!isSameOriginMutation(request))
    return apiError('FORBIDDEN', 403, 'This request was not accepted.');
  return user;
}

export function isUser(value: TeacherSessionUser | Response): value is TeacherSessionUser {
  return !(value instanceof Response);
}

export async function reserveStudentTutorQuota(
  studentUid: string,
): Promise<
  { ok: true; release: () => Promise<void> } | { ok: false; scope: 'student' | 'global' }
> {
  const { firebaseAdminDb } = await import('@/lib/server/firebase/admin');
  const db = firebaseQuotaDb(firebaseAdminDb());
  const day = utcDay(Date.now());
  const slots = [
    {
      id: 'student',
      path: `users/${studentUid}/generationUsage/studentTutor`,
      cap: studentTutorDailyCap(),
    },
    {
      id: 'global',
      path: 'generationUsage/studentTutorGlobal',
      cap: studentTutorGlobalDailyCap(),
    },
  ];
  const result = await reserveQuotaPaths(db, day, slots);
  if (result.status !== 'ok') {
    return { ok: false, scope: result.limitedId === 'global' ? 'global' : 'student' };
  }
  return {
    ok: true,
    release: () =>
      releaseQuotaPaths(
        db,
        day,
        slots.map((slot) => ({ id: slot.id, path: slot.path })),
      ),
  };
}
