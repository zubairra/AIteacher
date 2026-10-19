/**
 * Firestore rules for live classes. Skipped unless the Firestore emulator is
 * running (FIRESTORE_EMULATOR_HOST). Run with:
 *
 *   npx firebase-tools emulators:exec --only firestore --project demo-smartboard \
 *     "pnpm exec vitest run tests/auth/live-session-rules.emulator.test.ts"
 */
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!emulator)('live session Firestore rules', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-smartboard',
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    });
    envRef = env;
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  test('anonymous students can answer only their own open, unrevealed session', async () => {
    const teacher = context('teacher-1', 'google.com');
    const otherTeacher = context('teacher-2', 'google.com');
    const student = context('student-1', 'anonymous');
    const otherStudent = context('student-2', 'anonymous');
    const signedInStudent = context('student-3', 'google.com');

    await assertFails(student.firestore().doc('liveSessions/K7M2PQ').set(openSession('student-1')));
    await assertSucceeds(
      teacher.firestore().doc('liveSessions/K7M2PQ').set(openSession('teacher-1')),
    );
    await assertFails(otherTeacher.firestore().doc('liveSessions/K7M2PQ').get());
    await assertFails(teacher.firestore().collection('liveSessions').get());
    await assertSucceeds(student.firestore().doc('liveSessions/K7M2PQ').get());
    await assertFails(student.firestore().collection('liveSessions').get());
    await assertFails(env.unauthenticatedContext().firestore().doc('liveSessions/K7M2PQ').get());

    const ownResponse = student.firestore().doc('liveSessions/K7M2PQ/responses/student-1');
    await assertSucceeds(ownResponse.set(response()));
    await assertFails(
      student.firestore().doc('liveSessions/K7M2PQ/responses/student-2').set(response()),
    );
    await assertFails(
      signedInStudent.firestore().doc('liveSessions/K7M2PQ/responses/student-3').set(response()),
    );
    await assertFails(
      otherStudent.firestore().doc('liveSessions/K7M2PQ/responses/student-1').get(),
    );
    await assertFails(student.firestore().collection('liveSessions/K7M2PQ/responses').get());
    await assertSucceeds(teacher.firestore().doc('liveSessions/K7M2PQ/responses/student-1').get());
    await assertSucceeds(teacher.firestore().collection('liveSessions/K7M2PQ/responses').get());

    await assertFails(
      student.firestore().doc('users/teacher-1/lessons/lesson-1/liveKeys/K7M2PQ').get(),
    );
    await assertFails(
      student.firestore().doc('users/teacher-1/lessons/lesson-1/liveResults/K7M2PQ').get(),
    );
    await assertSucceeds(
      teacher
        .firestore()
        .doc('users/teacher-1/lessons/lesson-1/liveKeys/K7M2PQ')
        .set({
          version: 1,
          keys: { q: { kind: 'choice', correctOptionIds: ['electron'] } },
          prompts: [],
        }),
    );
    await assertFails(
      student.firestore().doc('liveSessions/K7M2PQ').update({ revealed: true, updatedAt: 2 }),
    );

    await assertSucceeds(
      teacher.firestore().doc('liveSessions/K7M2PQ').update({ revealed: true, updatedAt: 2 }),
    );
    await assertFails(ownResponse.update({ ...response(), updatedAt: 3 }));

    await assertSucceeds(
      teacher.firestore().doc('liveSessions/K7M2PQ').update({ status: 'closed', updatedAt: 4 }),
    );
    await assertFails(
      otherStudent.firestore().doc('liveSessions/K7M2PQ/responses/student-2').set(response()),
    );
    await assertFails(
      teacher
        .firestore()
        .doc('liveSessions/K7M2PQ')
        .update({ teacherUid: 'teacher-2', updatedAt: 5 }),
    );

    const saved = await teacher.firestore().doc('liveSessions/K7M2PQ/responses/student-1').get();
    expect(saved.data()?.displayName).toBe('Ava');
  });
});

function context(uid: string, provider: 'google.com' | 'anonymous') {
  return envFromUid(uid, provider);
}

let envRef: RulesTestEnvironment | undefined;

function envFromUid(uid: string, provider: 'google.com' | 'anonymous') {
  if (!envRef) throw new Error('Test environment is not ready');
  return envRef.authenticatedContext(uid, {
    firebase: { sign_in_provider: provider },
  });
}

function openSession(teacherUid: string) {
  return {
    version: 1,
    teacherUid,
    lessonId: 'lesson-1',
    lessonTitle: 'Atoms',
    status: 'open',
    sceneId: 'scene-1',
    sceneTitle: 'Charge',
    promptIndex: 0,
    prompts: [
      {
        kind: 'choice',
        id: 'scene-1:q1',
        prompt: 'Which particle?',
        multi: false,
        options: [
          { id: 'proton', label: 'Proton' },
          { id: 'electron', label: 'Electron' },
        ],
      },
    ],
    revealed: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

function response() {
  return {
    displayName: 'Ava',
    answers: { 'scene-1:q1': { kind: 'choice', optionIds: ['electron'] } },
    updatedAt: 2,
  };
}
