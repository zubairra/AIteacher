import { firebaseAdminDb } from '@/lib/server/firebase/admin';

export class StudentSignInError extends Error {
  constructor() {
    super('Age confirmation is required');
    this.name = 'StudentSignInError';
  }
}

export interface AccountDb {
  get(path: string): Promise<Record<string, unknown> | null>;
  set(path: string, value: Record<string, unknown>): Promise<void>;
}

const testRoles = new Map<string, 'teacher' | 'student'>();

/** Unit tests inject a role without Firestore. Production always reads the private account doc. */
export function setTestAccountRole(uid: string, role: 'teacher' | 'student' | null): void {
  if (role === null) testRoles.delete(uid);
  else testRoles.set(uid, role);
}

export function resetTestAccountRoles(): void {
  testRoles.clear();
}

export function roleFromAccountData(
  data: Record<string, unknown> | null | undefined,
): 'teacher' | 'student' {
  return data?.role === 'student' ? 'student' : 'teacher';
}

/**
 * Accounts that already exist stay teachers. A new student must confirm they
 * are 13 or older. This launch does not collect a date of birth and does not
 * open accounts for younger learners, because that needs a parental-consent
 * design the product does not have yet.
 */
export async function commitSignInRole(
  db: AccountDb,
  input: {
    uid: string;
    requestedRole?: 'teacher' | 'student';
    ageConfirmed: boolean;
    now: number;
  },
): Promise<{ role: 'teacher' | 'student'; notice?: string } | { error: 'underage' }> {
  const accountPath = `users/${input.uid}/private/account`;
  const existing = await db.get(accountPath);
  if (existing) {
    const role = roleFromAccountData(existing);
    if (input.requestedRole && input.requestedRole !== role) {
      return {
        role,
        notice:
          role === 'teacher'
            ? 'This Google account is already a teacher account, so it stays a teacher.'
            : 'This Google account is already a student account, so it stays a student.',
      };
    }
    return { role };
  }

  const user = await db.get(`users/${input.uid}`);
  if (user || input.requestedRole !== 'student') {
    await db.set(accountPath, {
      version: 1,
      role: 'teacher',
      createdAt: input.now,
      updatedAt: input.now,
    });
    return input.requestedRole === 'student'
      ? {
          role: 'teacher',
          notice: 'This Google account is already a teacher account, so it stays a teacher.',
        }
      : { role: 'teacher' };
  }

  if (!input.ageConfirmed) return { error: 'underage' };
  await db.set(accountPath, {
    version: 1,
    role: 'student',
    ageConfirmedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return { role: 'student' };
}

export async function readAccountRole(uid: string): Promise<'teacher' | 'student'> {
  if (process.env.VITEST === 'true' && process.env.ACCOUNT_ROLE_STORE !== 'firestore') {
    return testRoles.get(uid) ?? 'teacher';
  }
  const snap = await firebaseAdminDb().doc(`users/${uid}/private/account`).get();
  return roleFromAccountData(snap.exists ? snap.data() : null);
}

export function adminAccountDb(): AccountDb {
  const db = firebaseAdminDb();
  return {
    async get(path) {
      const snap = await db.doc(path).get();
      return snap.exists ? ((snap.data() as Record<string, unknown> | undefined) ?? null) : null;
    },
    async set(path, value) {
      await db.doc(path).set(value);
    },
  };
}
