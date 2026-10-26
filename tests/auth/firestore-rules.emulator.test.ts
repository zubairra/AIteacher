import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const describeRules = emulatorHost ? describe : describe.skip;

describeRules('Firestore rules on the emulator', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portValue] = emulatorHost!.split(':');
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-smartboard-rules',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
        host,
        port: Number(portValue),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  afterEach(async () => {
    await testEnv.clearFirestore();
  });

  function authed(uid: string) {
    return testEnv
      .authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } })
      .firestore();
  }

  test('a teacher can write and read only their own lesson', async () => {
    const teacherA = authed('teacher-a');
    const lesson = doc(teacherA, 'users/teacher-a/lessons/factorisation');
    await assertSucceeds(setDoc(lesson, { ownerUid: 'teacher-a', version: 1 }));
    await assertSucceeds(getDoc(lesson));
  });

  test('a teacher cannot create a lesson under another user id or with a foreign owner', async () => {
    const teacherB = authed('teacher-b');
    await assertFails(
      setDoc(doc(teacherB, 'users/teacher-a/lessons/factorisation'), {
        ownerUid: 'teacher-a',
        version: 1,
      }),
    );
    await assertFails(
      setDoc(doc(teacherB, 'users/teacher-b/lessons/stolen'), {
        ownerUid: 'teacher-a',
        version: 1,
      }),
    );
  });

  test('teacher B cannot read, update, or delete teacher A lesson', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/teacher-a/lessons/factorisation'), {
        ownerUid: 'teacher-a',
        version: 1,
      });
    });
    const teacherB = authed('teacher-b');
    const lesson = doc(teacherB, 'users/teacher-a/lessons/factorisation');
    await assertFails(getDoc(lesson));
    await assertFails(setDoc(lesson, { ownerUid: 'teacher-a', version: 2 }));
    await assertFails(deleteDoc(lesson));

    const teacherA = authed('teacher-a');
    await assertSucceeds(getDoc(doc(teacherA, 'users/teacher-a/lessons/factorisation')));
  });

  test('the browser cannot read credentials or settings, even for the owner', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users/teacher-a/providerCredentials/qwen'), { ciphertext: 'secret' });
      await setDoc(doc(db, 'users/teacher-a/settings/ai'), { providerId: 'qwen' });
    });
    const teacherA = authed('teacher-a');
    await assertFails(getDoc(doc(teacherA, 'users/teacher-a/providerCredentials/qwen')));
    await assertFails(getDoc(doc(teacherA, 'users/teacher-a/settings/ai')));
    await assertFails(
      setDoc(doc(teacherA, 'users/teacher-a/providerCredentials/qwen'), { ciphertext: 'nope' }),
    );
  });

  test('a teacher can save and read only their own whiteboard pages', async () => {
    const teacherA = authed('teacher-a');
    const board = doc(teacherA, 'users/teacher-a/whiteboards/standalone');
    const page = doc(teacherA, 'users/teacher-a/whiteboards/standalone/pages/page-1');
    await assertSucceeds(setDoc(board, { ownerUid: 'teacher-a', version: 1, lessonId: null }));
    await assertSucceeds(setDoc(page, { ownerUid: 'teacher-a', version: 1, marks: [] }));
    await assertSucceeds(getDoc(page));

    const teacherB = authed('teacher-b');
    await assertFails(getDoc(doc(teacherB, 'users/teacher-a/whiteboards/standalone')));
    await assertFails(getDoc(doc(teacherB, 'users/teacher-a/whiteboards/standalone/pages/page-1')));
    await assertFails(
      setDoc(doc(teacherB, 'users/teacher-b/whiteboards/stolen'), {
        ownerUid: 'teacher-a',
        version: 1,
      }),
    );
    await assertFails(
      setDoc(doc(teacherB, 'users/teacher-a/whiteboards/standalone/pages/page-1'), {
        ownerUid: 'teacher-a',
        version: 2,
      }),
    );
    await assertFails(
      setDoc(doc(teacherA, 'users/teacher-a/whiteboards/standalone/pages/too-big'), {
        ownerUid: 'teacher-a',
        blob: 'x'.repeat(950_000),
      }),
    );
    const guest = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(guest, 'users/teacher-a/whiteboards/standalone/pages/page-1')));
  });

  test('anonymous clients cannot read a lesson', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/teacher-a/lessons/factorisation'), {
        ownerUid: 'teacher-a',
      });
    });
    const guest = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(guest, 'users/teacher-a/lessons/factorisation')));
  });
});

if (!emulatorHost) {
  test('Firestore emulator rules are skipped until FIRESTORE_EMULATOR_HOST is set', () => {
    expect(emulatorHost).toBeUndefined();
  });
}
