import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

import { firebaseLessonPath } from '@/lib/persistence/firestore-document-store';

describe('Firestore ownership boundaries', () => {
  test('scopes lesson paths by Firebase UID', () => {
    expect(firebaseLessonPath('teacher-a', 'lesson-1')).toBe('users/teacher-a/lessons/lesson-1');
    expect(firebaseLessonPath('teacher-b', 'lesson-1')).toBe('users/teacher-b/lessons/lesson-1');
    expect(firebaseLessonPath('teacher-a', 'lesson-1')).not.toBe(
      firebaseLessonPath('teacher-b', 'lesson-1'),
    );
  });

  test('rules bind user data to request.auth.uid and deny credential browser reads', async () => {
    const rules = await readFile('firestore.rules', 'utf8');
    expect(rules).toContain('request.auth.uid == uid');
    expect(rules).toMatch(/allow read: if signedInAs\(uid\);/);
    expect(rules).toContain('request.resource.data.ownerUid == uid');
    expect(rules).toMatch(
      /match \/providerCredentials\/\{providerId\}[\s\S]*?allow read, write: if false;/,
    );
    expect(rules).toMatch(/match \/settings\/\{settingId\}[\s\S]*?allow read, write: if false;/);
    expect(rules).toContain('allow read, write: if false;');
  });
});
