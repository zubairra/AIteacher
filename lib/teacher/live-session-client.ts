'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseClient } from '@/lib/firebase/client';
import {
  assertPublicPrompts,
  createJoinCode,
  findSecretKeys,
  joinCodeIsValid,
  parseStudentAnswer,
  sanitizeDisplayName,
  type AnswerKey,
  type LiveResultRecord,
  type PublicPrompt,
  type StoredResponse,
  type StudentAnswer,
} from '@/lib/teacher/live-session';

export interface LiveSessionDocument {
  version: 1;
  teacherUid: string;
  lessonId: string;
  lessonTitle: string;
  status: 'open' | 'closed';
  sceneId: string;
  sceneTitle: string;
  promptIndex: number;
  prompts: PublicPrompt[];
  revealed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LiveKeyDocument {
  version: 1;
  keys: Record<string, AnswerKey>;
  prompts: PublicPrompt[];
}

const SESSION_FIELDS = [
  'version',
  'teacherUid',
  'lessonId',
  'lessonTitle',
  'status',
  'sceneId',
  'sceneTitle',
  'promptIndex',
  'prompts',
  'revealed',
  'createdAt',
  'updatedAt',
] as const;

export function liveSessionRef(db: Firestore, code: string) {
  return doc(db, 'liveSessions', code);
}

export function liveKeyRef(db: Firestore, teacherUid: string, lessonId: string, code: string) {
  return doc(db, 'users', teacherUid, 'lessons', lessonId, 'liveKeys', code);
}

export function liveResultRef(db: Firestore, teacherUid: string, lessonId: string, code: string) {
  return doc(db, 'users', teacherUid, 'lessons', lessonId, 'liveResults', code);
}

export function liveResponseRef(db: Firestore, code: string, studentUid: string) {
  return doc(db, 'liveSessions', code, 'responses', studentUid);
}

export function sessionDocument(input: {
  teacherUid: string;
  lessonId: string;
  lessonTitle: string;
  sceneId: string;
  sceneTitle: string;
  prompts: PublicPrompt[];
  now: number;
}): LiveSessionDocument {
  assertPublicPrompts(input.prompts);
  const document: LiveSessionDocument = {
    version: 1,
    teacherUid: input.teacherUid,
    lessonId: input.lessonId,
    lessonTitle: input.lessonTitle.slice(0, 200),
    status: 'open',
    sceneId: input.sceneId,
    sceneTitle: input.sceneTitle.slice(0, 200),
    promptIndex: 0,
    prompts: input.prompts,
    revealed: false,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const extra = Object.keys(document).filter(
    (key) => !SESSION_FIELDS.includes(key as (typeof SESSION_FIELDS)[number]),
  );
  if (extra.length || findSecretKeys(document).length) {
    throw new Error('Refusing to publish a live session that contains answer keys');
  }
  return document;
}

export async function startLiveSession(input: {
  lessonId: string;
  lessonTitle: string;
  sceneId: string;
  sceneTitle: string;
  prompts: PublicPrompt[];
  keys: Record<string, AnswerKey>;
}): Promise<{ code: string }> {
  const { auth, db } = getFirebaseClient();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in as a teacher to start a live class.');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createJoinCode();
    const existing = await getDoc(liveSessionRef(db, code));
    if (existing.exists()) continue;
    const now = Date.now();
    await setDoc(
      liveSessionRef(db, code),
      sessionDocument({ ...input, teacherUid: user.uid, now }),
    );
    await setDoc(liveKeyRef(db, user.uid, input.lessonId, code), {
      version: 1,
      keys: input.keys,
      prompts: input.prompts,
    } satisfies LiveKeyDocument);
    return { code };
  }
  throw new Error('Could not reserve a join code. Try again.');
}

export async function publishScene(input: {
  code: string;
  lessonId: string;
  sceneId: string;
  sceneTitle: string;
  prompts: PublicPrompt[];
  keys: Record<string, AnswerKey>;
}): Promise<void> {
  const { auth, db } = getFirebaseClient();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in as a teacher to update the live class.');
  assertPublicPrompts(input.prompts);
  const keySnap = await getDoc(liveKeyRef(db, user.uid, input.lessonId, input.code));
  const previous = keySnap.data() as LiveKeyDocument | undefined;
  const previousPrompts = previous?.prompts ?? [];
  const previousKeys = previous?.keys ?? {};
  // Keep the first public shuffle for a question so returning to a scene does not
  // invalidate answers already stored on student devices.
  const promptsForScene = input.prompts.map(
    (prompt) => previousPrompts.find((item) => item.id === prompt.id) ?? prompt,
  );
  assertPublicPrompts(promptsForScene);
  const keys = { ...previousKeys };
  for (const prompt of input.prompts) {
    if (!keys[prompt.id] && input.keys[prompt.id]) keys[prompt.id] = input.keys[prompt.id];
  }
  const prompts = [...previousPrompts, ...promptsForScene].filter(
    (prompt, index, all) => all.findIndex((item) => item.id === prompt.id) === index,
  );
  await updateDoc(liveSessionRef(db, input.code), {
    sceneId: input.sceneId,
    sceneTitle: input.sceneTitle.slice(0, 200),
    prompts: promptsForScene,
    promptIndex: 0,
    revealed: false,
    status: 'open',
    updatedAt: Date.now(),
  });
  await setDoc(liveKeyRef(db, user.uid, input.lessonId, input.code), {
    version: 1,
    keys,
    prompts,
  } satisfies LiveKeyDocument);
}

export async function setPromptIndex(code: string, promptIndex: number): Promise<void> {
  const { db } = getFirebaseClient();
  await updateDoc(liveSessionRef(db, code), {
    promptIndex,
    revealed: false,
    updatedAt: Date.now(),
  });
}

export async function revealLiveAnswers(code: string): Promise<void> {
  const { db } = getFirebaseClient();
  await updateDoc(liveSessionRef(db, code), { revealed: true, updatedAt: Date.now() });
}

export async function closeLiveSession(input: {
  code: string;
  lessonId: string;
  result: LiveResultRecord;
}): Promise<void> {
  const { auth, db } = getFirebaseClient();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in as a teacher to save class results.');
  if (findSecretKeys(input.result).length) {
    throw new Error('Refusing to save class results that include answer keys');
  }
  await setDoc(liveResultRef(db, user.uid, input.lessonId, input.code), input.result);
  await updateDoc(liveSessionRef(db, input.code), { status: 'closed', updatedAt: Date.now() });
}

export function watchLiveSession(
  code: string,
  onChange: (session: LiveSessionDocument | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const { db } = getFirebaseClient();
  return onSnapshot(
    liveSessionRef(db, code),
    (snapshot) => {
      onChange(snapshot.exists() ? (snapshot.data() as LiveSessionDocument) : null);
    },
    (error) => onError?.(error),
  );
}

export function watchLiveResponses(
  code: string,
  onChange: (responses: StoredResponse[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const { db } = getFirebaseClient();
  return onSnapshot(
    collection(db, 'liveSessions', code, 'responses'),
    (snapshot) => {
      onChange(snapshot.docs.map((item) => storedResponse(item.data())));
    },
    (error) => onError?.(error),
  );
}

export async function readLiveKeys(
  lessonId: string,
  code: string,
): Promise<LiveKeyDocument | null> {
  const { auth, db } = getFirebaseClient();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  const snapshot = await getDoc(liveKeyRef(db, user.uid, lessonId, code));
  return snapshot.exists() ? (snapshot.data() as LiveKeyDocument) : null;
}

export async function submitLiveAnswer(input: {
  code: string;
  studentUid: string;
  displayName: string;
  promptId: string;
  answer: StudentAnswer;
  previous: Record<string, StudentAnswer>;
}): Promise<void> {
  if (!joinCodeIsValid(input.code)) throw new Error('That join code is not valid.');
  const displayName = sanitizeDisplayName(input.displayName);
  if (!displayName) throw new Error('Enter a name.');
  const { db } = getFirebaseClient();
  await setDoc(liveResponseRef(db, input.code, input.studentUid), {
    displayName,
    answers: { ...input.previous, [input.promptId]: input.answer },
    updatedAt: Date.now(),
  });
}

function storedResponse(value: unknown): StoredResponse {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const answers: Record<string, StudentAnswer> = {};
  if (record.answers && typeof record.answers === 'object') {
    for (const [id, answer] of Object.entries(record.answers as Record<string, unknown>)) {
      const parsed = parseStudentAnswer(answer);
      if (parsed && id.length > 0 && id.length <= 160) answers[id] = parsed;
    }
  }
  const displayName = sanitizeDisplayName(
    typeof record.displayName === 'string' ? record.displayName : '',
  );
  return { displayName: displayName || 'Student', answers };
}

export async function listLiveResults(lessonId: string): Promise<LiveResultRecord[]> {
  const { auth, db } = getFirebaseClient();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in as a teacher to view class results.');
  const snapshot = await getDocs(
    collection(db, 'users', user.uid, 'lessons', lessonId, 'liveResults'),
  );
  return snapshot.docs
    .map((item) => item.data() as LiveResultRecord)
    .sort((a, b) => b.closedAt - a.closedAt);
}
