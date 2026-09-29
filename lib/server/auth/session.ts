import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { firebaseAdminAuth, firebaseAdminDb } from '@/lib/server/firebase/admin';

export const TEACHER_SESSION_COOKIE = 'smartboard_firebase_session';
const SESSION_SECONDS = 14 * 24 * 60 * 60;

export interface TeacherSessionUser {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
}

/** Compatibility owner key for optional upstream PostgreSQL-backed agent runtime data. */
export function teacherOwnerId(userId: string): string {
  return `firebase:${userId}`;
}

function requestCookie(headers: Headers, name: string): string | undefined {
  const raw = headers.get('cookie');
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
}

function userFromClaims(claims: {
  uid: string;
  name?: string;
  email?: string;
  picture?: string;
}): TeacherSessionUser {
  return {
    id: claims.uid,
    name: claims.name || claims.email || 'Teacher',
    email: claims.email || '',
    ...(claims.picture ? { photoURL: claims.picture } : {}),
  };
}

export async function createTeacherSession(idToken: string) {
  const auth = firebaseAdminAuth();
  const decoded = await auth.verifyIdToken(idToken, true);
  const token = await auth.createSessionCookie(idToken, { expiresIn: SESSION_SECONDS * 1000 });
  const user = userFromClaims(decoded);
  const profile = firebaseAdminDb().doc(`users/${decoded.uid}`);
  const existing = await profile.get();
  await profile.set(
    {
      version: 1,
      displayName: user.name,
      email: user.email,
      photoURL: user.photoURL ?? null,
      createdAt: existing.exists ? (existing.data()?.createdAt ?? Date.now()) : Date.now(),
      updatedAt: Date.now(),
    },
    { merge: true },
  );
  return { token, user };
}

export async function resolveTeacherSessionToken(
  token: string | undefined,
): Promise<TeacherSessionUser | null> {
  if (!token) return null;
  try {
    return userFromClaims(await firebaseAdminAuth().verifySessionCookie(token, true));
  } catch {
    return null;
  }
}

export function resolveTeacherSessionRequest(request: Pick<Request, 'headers'>) {
  return resolveTeacherSessionToken(requestCookie(request.headers, TEACHER_SESSION_COOKIE));
}

export async function getTeacherPageSession() {
  const jar = await cookies();
  return resolveTeacherSessionToken(jar.get(TEACHER_SESSION_COOKIE)?.value);
}

export async function requireTeacherPageSession(): Promise<TeacherSessionUser> {
  const user = await getTeacherPageSession();
  if (!user) redirect('/sign-in');
  return user;
}

export function teacherSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== '0';
  return `${TEACHER_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearTeacherSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== '0';
  return `${TEACHER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
