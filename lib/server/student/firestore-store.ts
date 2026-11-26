import { randomBytes } from 'node:crypto';

import { type Firestore } from 'firebase-admin/firestore';

import { firebaseAdminDb } from '@/lib/server/firebase/admin';
import { JOIN_CODE_ALPHABET } from '@/lib/student/nav';
import { emptyLearningProfile } from '@/lib/student/profile';
import { emptyLearningStats } from '@/lib/student/progress';
import { decideAbort, decideClaim, decideComplete } from '@/lib/student/turns';
import type {
  GradingKey,
  LearningProfile,
  LearningStats,
  PublicSubmission,
  TutorMode,
} from '@/lib/student/types';
import type {
  ClassLessonRef,
  ClaimDecision,
  LessonGrant,
  StoredLesson,
  StoredMessage,
  StudentStore,
  TutorSessionRecord,
} from '@/lib/student/turn-types';

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createJoinCode(): string {
  const bytes = randomBytes(6);
  return [...bytes].map((byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length]).join('');
}

function asSession(id: string, data: Record<string, unknown>): TutorSessionRecord | null {
  if (typeof data.studentUid !== 'string' || typeof data.grantId !== 'string') return null;
  const mode = data.mode;
  if (
    mode !== 'explain' &&
    mode !== 'step' &&
    mode !== 'practice' &&
    mode !== 'revision' &&
    mode !== 'exam'
  ) {
    return null;
  }
  return {
    id,
    studentUid: data.studentUid,
    grantId: data.grantId,
    mode,
    title: typeof data.title === 'string' ? data.title : 'Lesson',
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    inflightClientMessageId:
      typeof data.inflightClientMessageId === 'string' ? data.inflightClientMessageId : null,
    concepts: Array.isArray(data.concepts)
      ? data.concepts.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

function asMessage(id: string, data: Record<string, unknown>): StoredMessage | null {
  if (data.role !== 'user' && data.role !== 'assistant') return null;
  const mode = data.mode as TutorMode;
  if (!mode) return null;
  return jsonSafe({
    id,
    role: data.role,
    text: typeof data.text === 'string' ? data.text : '',
    mode,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    ...(typeof data.clientMessageId === 'string' ? { clientMessageId: data.clientMessageId } : {}),
    ...(Array.isArray(data.followUps) ? { followUps: data.followUps } : {}),
    ...(data.activity && typeof data.activity === 'object' ? { activity: data.activity } : {}),
    ...(data.submission && typeof data.submission === 'object'
      ? { submission: data.submission }
      : {}),
  }) as StoredMessage;
}

export class FirestoreStudentStore implements StudentStore {
  constructor(private readonly db: Firestore) {}

  async getLesson(teacherUid: string, lessonId: string): Promise<StoredLesson | null> {
    const lesson = this.db.doc(`users/${teacherUid}/lessons/${lessonId}`);
    const [snapshot, scenes] = await Promise.all([lesson.get(), lesson.collection('scenes').get()]);
    if (!snapshot.exists) return null;
    const data = snapshot.data() ?? {};
    const stage =
      data.stage && typeof data.stage === 'object'
        ? (data.stage as Record<string, unknown>)
        : { name: data.name, teacherLesson: data.teacherLesson };
    const teacherLesson =
      stage.teacherLesson && typeof stage.teacherLesson === 'object'
        ? (stage.teacherLesson as Record<string, unknown>)
        : undefined;
    const sceneValues = scenes.docs
      .map((item) => {
        const row = item.data();
        return row.scene ?? row;
      })
      .sort((left, right) => {
        const leftOrder = typeof left?.order === 'number' ? left.order : 0;
        const rightOrder = typeof right?.order === 'number' ? right.order : 0;
        return leftOrder - rightOrder;
      });
    return {
      title: String(stage.name ?? data.name ?? 'Untitled lesson'),
      subject: typeof teacherLesson?.subject === 'string' ? teacherLesson.subject : '',
      grade: typeof teacherLesson?.grade === 'string' ? teacherLesson.grade : '',
      topic:
        typeof teacherLesson?.topic === 'string' ? teacherLesson.topic : String(stage.name ?? ''),
      stage,
      scenes: sceneValues,
    };
  }

  async getOrCreateClassroom(teacherUid: string, now: number) {
    const pointer = this.db.doc(`users/${teacherUid}/classroom/default`);
    return this.db.runTransaction(async (tx) => {
      const existing = await tx.get(pointer);
      if (existing.exists) {
        const data = existing.data() ?? {};
        return {
          classId: String(data.classId),
          joinCode: String(data.joinCode),
          name: String(data.name ?? 'My class'),
        };
      }
      let joinCode = createJoinCode();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const taken = await tx.get(this.db.doc(`joinCodes/${joinCode}`));
        if (!taken.exists) break;
        joinCode = createJoinCode();
      }
      const classId = `cls_${randomBytes(9).toString('hex')}`;
      const record = { classId, joinCode, name: 'My class' };
      tx.set(pointer, record);
      tx.set(this.db.doc(`classes/${classId}`), {
        teacherUid,
        name: 'My class',
        joinCode,
        createdAt: now,
      });
      tx.set(this.db.doc(`joinCodes/${joinCode}`), {
        classId,
        teacherUid,
        name: 'My class',
      });
      return record;
    });
  }

  async addClassLesson(classId: string, lesson: ClassLessonRef, now: number): Promise<void> {
    await this.db
      .doc(`classes/${classId}/lessons/${lesson.lessonId}`)
      .set({ ...lesson, addedAt: now });
  }

  async listClassLessons(classId: string): Promise<ClassLessonRef[]> {
    const snapshot = await this.db.collection(`classes/${classId}/lessons`).get();
    return snapshot.docs.map((item) => {
      const data = item.data();
      return {
        lessonId: String(data.lessonId ?? item.id),
        title: String(data.title ?? 'Untitled lesson'),
        teacherUid: String(data.teacherUid ?? ''),
      };
    });
  }

  async listMemberUids(classId: string): Promise<string[]> {
    const snapshot = await this.db.collection(`classes/${classId}/members`).get();
    return snapshot.docs.map((item) => item.id);
  }

  async lookupJoinCode(code: string) {
    const snapshot = await this.db.doc(`joinCodes/${code}`).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() ?? {};
    if (typeof data.classId !== 'string' || typeof data.teacherUid !== 'string') return null;
    return {
      classId: data.classId,
      teacherUid: data.teacherUid,
      name: String(data.name ?? 'Class'),
    };
  }

  async addMember(classId: string, studentUid: string, now: number): Promise<void> {
    await this.db
      .doc(`classes/${classId}/members/${studentUid}`)
      .set({ joinedAt: now }, { merge: true });
  }

  async saveShare(share: {
    token: string;
    teacherUid: string;
    lessonId: string;
    createdAt: number;
  }) {
    const batch = this.db.batch();
    batch.set(this.db.doc(`lessonShares/${share.token}`), share);
    batch.set(this.db.doc(`users/${share.teacherUid}/lessonShareIndex/${share.lessonId}`), {
      token: share.token,
    });
    await batch.commit();
  }

  async findShareByLesson(teacherUid: string, lessonId: string) {
    const snapshot = await this.db.doc(`users/${teacherUid}/lessonShareIndex/${lessonId}`).get();
    const token = snapshot.data()?.token;
    return typeof token === 'string' ? { token } : null;
  }

  async getShare(token: string) {
    const snapshot = await this.db.doc(`lessonShares/${token}`).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() ?? {};
    if (typeof data.teacherUid !== 'string' || typeof data.lessonId !== 'string') return null;
    return { token, teacherUid: data.teacherUid, lessonId: data.lessonId };
  }

  async putGrant(grant: LessonGrant): Promise<void> {
    await this.db.doc(`users/${grant.studentUid}/lessonGrants/${grant.id}`).set(jsonSafe(grant));
  }

  async getGrant(studentUid: string, grantId: string): Promise<LessonGrant | null> {
    const snapshot = await this.db.doc(`users/${studentUid}/lessonGrants/${grantId}`).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as LessonGrant | undefined;
    if (!data || data.studentUid !== studentUid) return null;
    return data;
  }

  async listGrants(studentUid: string): Promise<LessonGrant[]> {
    const snapshot = await this.db.collection(`users/${studentUid}/lessonGrants`).get();
    return snapshot.docs
      .map((item) => item.data() as LessonGrant)
      .filter((grant) => grant.studentUid === studentUid)
      .sort((a, b) => b.sharedAt - a.sharedAt);
  }

  private sessionRef(studentUid: string, sessionId: string) {
    return this.db.doc(`users/${studentUid}/tutorSessions/${sessionId}`);
  }

  async getSession(studentUid: string, sessionId: string): Promise<TutorSessionRecord | null> {
    const snapshot = await this.sessionRef(studentUid, sessionId).get();
    if (!snapshot.exists) return null;
    const session = asSession(sessionId, snapshot.data() ?? {});
    if (!session || session.studentUid !== studentUid) return null;
    return session;
  }

  async listSessions(studentUid: string): Promise<TutorSessionRecord[]> {
    const snapshot = await this.db.collection(`users/${studentUid}/tutorSessions`).get();
    return snapshot.docs
      .map((item) => asSession(item.id, item.data()))
      .filter(
        (session): session is TutorSessionRecord =>
          session !== null && session.studentUid === studentUid,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
  }

  async listMessages(studentUid: string, sessionId: string): Promise<StoredMessage[]> {
    const session = await this.getSession(studentUid, sessionId);
    if (!session) return [];
    const snapshot = await this.sessionRef(studentUid, sessionId).collection('messages').get();
    return snapshot.docs
      .map((item) => asMessage(item.id, item.data()))
      .filter((message): message is StoredMessage => message !== null)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async applyClaim(input: {
    incoming: TutorSessionRecord;
    userMessage: StoredMessage;
  }): Promise<ClaimDecision> {
    const ref = this.sessionRef(input.incoming.studentUid, input.incoming.id);
    return this.db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(ref);
      const messageSnap = await tx.get(ref.collection('messages'));
      const existing = sessionSnap.exists
        ? asSession(input.incoming.id, sessionSnap.data() ?? {})
        : null;
      const messages = messageSnap.docs
        .map((item) => asMessage(item.id, item.data()))
        .filter((message): message is StoredMessage => message !== null)
        .sort((a, b) => a.createdAt - b.createdAt);
      const decision = decideClaim({
        existing,
        messages,
        incoming: input.incoming,
        userMessage: input.userMessage,
      });
      if (decision.kind === 'start') {
        tx.set(ref, jsonSafe(decision.session));
        const added = decision.messages[decision.messages.length - 1];
        if (added) tx.set(ref.collection('messages').doc(added.id), jsonSafe(added));
      } else if (decision.kind === 'resume') {
        tx.set(ref, jsonSafe(decision.session), { merge: true });
      }
      return decision;
    });
  }

  async applyComplete(
    studentUid: string,
    sessionId: string,
    assistant: StoredMessage,
    concepts: string[],
  ): Promise<void> {
    const ref = this.sessionRef(studentUid, sessionId);
    await this.db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(ref);
      if (!sessionSnap.exists) return;
      const session = asSession(sessionId, sessionSnap.data() ?? {});
      if (!session || session.studentUid !== studentUid) return;
      const messageSnap = await tx.get(ref.collection('messages'));
      const messages = messageSnap.docs
        .map((item) => asMessage(item.id, item.data()))
        .filter((message): message is StoredMessage => message !== null);
      const next = decideComplete(session, messages, assistant);
      next.session.concepts = [...new Set([...session.concepts, ...concepts])].slice(-12);
      tx.set(ref, jsonSafe(next.session));
      tx.set(ref.collection('messages').doc(assistant.id), jsonSafe(assistant));
    });
  }

  async applyAbort(studentUid: string, sessionId: string): Promise<void> {
    const ref = this.sessionRef(studentUid, sessionId);
    await this.db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(ref);
      if (!sessionSnap.exists) return;
      const session = asSession(sessionId, sessionSnap.data() ?? {});
      if (!session || session.studentUid !== studentUid) return;
      tx.set(ref, jsonSafe(decideAbort(session)), { merge: true });
    });
  }

  async saveSubmission(
    studentUid: string,
    sessionId: string,
    messageId: string,
    submission: PublicSubmission,
  ): Promise<StoredMessage | null> {
    const ref = this.sessionRef(studentUid, sessionId).collection('messages').doc(messageId);
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return null;
      const message = asMessage(messageId, snapshot.data() ?? {});
      if (!message) return null;
      if (message.submission) return message;
      const next = { ...message, submission };
      tx.set(ref, jsonSafe(next));
      return next;
    });
  }

  async saveGradingKey(studentUid: string, sessionId: string, messageId: string, key: GradingKey) {
    await this.sessionRef(studentUid, sessionId)
      .collection('keys')
      .doc(messageId)
      .set(jsonSafe(key));
  }

  async getGradingKey(studentUid: string, sessionId: string, messageId: string) {
    const snapshot = await this.sessionRef(studentUid, sessionId)
      .collection('keys')
      .doc(messageId)
      .get();
    if (!snapshot.exists) return null;
    return (snapshot.data() as GradingKey | undefined) ?? null;
  }

  async getProfile(studentUid: string, fallbackName: string): Promise<LearningProfile> {
    const snapshot = await this.db.doc(`users/${studentUid}/learning/profile`).get();
    if (!snapshot.exists) return emptyLearningProfile(fallbackName);
    const data = snapshot.data() ?? {};
    return {
      displayName: typeof data.displayName === 'string' ? data.displayName : fallbackName,
      gradeLevel: typeof data.gradeLevel === 'string' ? data.gradeLevel : '',
      subjects: Array.isArray(data.subjects)
        ? data.subjects.filter((item): item is string => typeof item === 'string')
        : [],
      focus: typeof data.focus === 'string' ? data.focus : '',
    };
  }

  async saveProfile(studentUid: string, profile: LearningProfile): Promise<void> {
    await this.db.doc(`users/${studentUid}/learning/profile`).set(profile);
  }

  async getStats(studentUid: string): Promise<LearningStats> {
    const snapshot = await this.db.doc(`users/${studentUid}/learning/stats`).get();
    if (!snapshot.exists) return emptyLearningStats();
    const data = snapshot.data();
    if (!data || data.version !== 1) return emptyLearningStats();
    return data as LearningStats;
  }

  async saveStats(studentUid: string, stats: LearningStats): Promise<void> {
    await this.db.doc(`users/${studentUid}/learning/stats`).set(jsonSafe(stats));
  }
}

export function studentStore(): StudentStore {
  return new FirestoreStudentStore(firebaseAdminDb());
}
