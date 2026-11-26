import { describe, expect, it } from 'vitest';

import {
  commitSignInRole,
  roleFromAccountData,
  type AccountDb,
} from '@/lib/server/student/account';

function memoryDb(): AccountDb & { writes: string[] } {
  const docs = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  return {
    writes,
    async get(path) {
      return docs.get(path) ?? null;
    },
    async set(path, value) {
      writes.push(path);
      docs.set(path, value);
    },
  };
}

describe('student sign-in role', () => {
  it('blocks a new student who does not confirm they are 13 or older', async () => {
    const db = memoryDb();
    const result = await commitSignInRole(db, {
      uid: 'new-student',
      requestedRole: 'student',
      ageConfirmed: false,
      now: 10,
    });
    expect(result).toEqual({ error: 'underage' });
    expect(db.writes).toEqual([]);
  });

  it('creates a student account only after age confirmation', async () => {
    const db = memoryDb();
    const result = await commitSignInRole(db, {
      uid: 'new-student',
      requestedRole: 'student',
      ageConfirmed: true,
      now: 10,
    });
    expect(result).toEqual({ role: 'student' });
    const saved = await db.get('users/new-student/private/account');
    expect(saved).toMatchObject({ role: 'student', ageConfirmedAt: 10 });
    expect(saved).not.toHaveProperty('dateOfBirth');
  });

  it('keeps an existing teacher account from becoming a student', async () => {
    const db = memoryDb();
    await db.set('users/teacher-a', { displayName: 'Teacher' });
    const result = await commitSignInRole(db, {
      uid: 'teacher-a',
      requestedRole: 'student',
      ageConfirmed: true,
      now: 20,
    });
    expect('role' in result && result.role).toBe('teacher');
    expect('notice' in result && result.notice).toMatch(/teacher account/);
    expect(roleFromAccountData(await db.get('users/teacher-a/private/account'))).toBe('teacher');
  });

  it('does not let a student flip to teacher on a later sign-in', async () => {
    const db = memoryDb();
    await commitSignInRole(db, {
      uid: 'student-a',
      requestedRole: 'student',
      ageConfirmed: true,
      now: 1,
    });
    const again = await commitSignInRole(db, {
      uid: 'student-a',
      requestedRole: 'teacher',
      ageConfirmed: false,
      now: 2,
    });
    expect('role' in again && again.role).toBe('student');
    expect('notice' in again && again.notice).toMatch(/student account/);
  });
});
