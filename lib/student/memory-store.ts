import { JOIN_CODE_ALPHABET } from './nav';
import { decideAbort, decideClaim, decideComplete } from './turns';
import { emptyLearningProfile } from './profile';
import { emptyLearningStats } from './progress';
import type { GradingKey, LearningProfile, LearningStats, PublicSubmission } from './types';
import type {
  ClassLessonRef,
  ClaimDecision,
  LessonGrant,
  StoredLesson,
  StoredMessage,
  StudentStore,
  TutorSessionRecord,
} from './turn-types';

function lessonKey(teacherUid: string, lessonId: string): string {
  return `${teacherUid}\n${lessonId}`;
}

function messageKey(studentUid: string, sessionId: string): string {
  return `${studentUid}\n${sessionId}`;
}

function codeFrom(index: number): string {
  let value = index + 1;
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out = JOIN_CODE_ALPHABET[value % JOIN_CODE_ALPHABET.length] + out;
    value = Math.floor(value / JOIN_CODE_ALPHABET.length);
  }
  return out;
}

/** In-memory store used by unit tests. Production uses the Firestore store. */
export class MemoryStudentStore implements StudentStore {
  private classCount = 0;
  readonly lessons = new Map<string, StoredLesson>();
  readonly classrooms = new Map<string, { classId: string; joinCode: string; name: string }>();
  readonly classLessons = new Map<string, ClassLessonRef[]>();
  readonly members = new Map<string, string[]>();
  readonly joinCodes = new Map<string, { classId: string; teacherUid: string; name: string }>();
  readonly shares = new Map<string, { token: string; teacherUid: string; lessonId: string }>();
  readonly shareByLesson = new Map<string, string>();
  readonly grants = new Map<string, LessonGrant>();
  readonly sessions = new Map<string, TutorSessionRecord>();
  readonly messages = new Map<string, StoredMessage[]>();
  readonly keys = new Map<string, GradingKey>();
  readonly profiles = new Map<string, LearningProfile>();
  readonly stats = new Map<string, LearningStats>();

  async getLesson(teacherUid: string, lessonId: string): Promise<StoredLesson | null> {
    return this.lessons.get(lessonKey(teacherUid, lessonId)) ?? null;
  }

  async getOrCreateClassroom(teacherUid: string, now: number) {
    const existing = this.classrooms.get(teacherUid);
    if (existing) return existing;
    this.classCount += 1;
    const created = {
      classId: `cls_${this.classCount}`,
      joinCode: codeFrom(this.classCount),
      name: 'My class',
    };
    void now;
    this.classrooms.set(teacherUid, created);
    this.joinCodes.set(created.joinCode, {
      classId: created.classId,
      teacherUid,
      name: created.name,
    });
    return created;
  }

  async addClassLesson(classId: string, lesson: ClassLessonRef): Promise<void> {
    const list = this.classLessons.get(classId) ?? [];
    if (
      !list.some(
        (item) => item.lessonId === lesson.lessonId && item.teacherUid === lesson.teacherUid,
      )
    ) {
      list.push(lesson);
    }
    this.classLessons.set(classId, list);
  }

  async listClassLessons(classId: string): Promise<ClassLessonRef[]> {
    return [...(this.classLessons.get(classId) ?? [])];
  }

  async listMemberUids(classId: string): Promise<string[]> {
    return [...(this.members.get(classId) ?? [])];
  }

  async lookupJoinCode(code: string) {
    return this.joinCodes.get(code) ?? null;
  }

  async addMember(classId: string, studentUid: string): Promise<void> {
    const list = this.members.get(classId) ?? [];
    if (!list.includes(studentUid)) list.push(studentUid);
    this.members.set(classId, list);
  }

  async saveShare(share: {
    token: string;
    teacherUid: string;
    lessonId: string;
    createdAt: number;
  }) {
    this.shares.set(share.token, share);
    this.shareByLesson.set(lessonKey(share.teacherUid, share.lessonId), share.token);
  }

  async findShareByLesson(teacherUid: string, lessonId: string) {
    const token = this.shareByLesson.get(lessonKey(teacherUid, lessonId));
    return token ? { token } : null;
  }

  async getShare(token: string) {
    return this.shares.get(token) ?? null;
  }

  async putGrant(grant: LessonGrant): Promise<void> {
    this.grants.set(`${grant.studentUid}\n${grant.id}`, grant);
  }

  async getGrant(studentUid: string, grantId: string): Promise<LessonGrant | null> {
    const grant = this.grants.get(`${studentUid}\n${grantId}`) ?? null;
    if (!grant || grant.studentUid !== studentUid) return null;
    return grant;
  }

  async listGrants(studentUid: string): Promise<LessonGrant[]> {
    return [...this.grants.values()]
      .filter((grant) => grant.studentUid === studentUid)
      .sort((a, b) => b.sharedAt - a.sharedAt);
  }

  async getSession(studentUid: string, sessionId: string): Promise<TutorSessionRecord | null> {
    const session = this.sessions.get(sessionId) ?? null;
    if (!session || session.studentUid !== studentUid) return null;
    return session;
  }

  async listSessions(studentUid: string): Promise<TutorSessionRecord[]> {
    return [...this.sessions.values()]
      .filter((session) => session.studentUid === studentUid)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listMessages(studentUid: string, sessionId: string): Promise<StoredMessage[]> {
    const session = await this.getSession(studentUid, sessionId);
    if (!session) return [];
    return [...(this.messages.get(messageKey(studentUid, sessionId)) ?? [])];
  }

  async applyClaim(input: {
    incoming: TutorSessionRecord;
    userMessage: StoredMessage;
  }): Promise<ClaimDecision> {
    const existing = this.sessions.get(input.incoming.id) ?? null;
    if (existing && existing.studentUid !== input.incoming.studentUid) return { kind: 'forbidden' };
    const messages = existing
      ? [...(this.messages.get(messageKey(existing.studentUid, existing.id)) ?? [])]
      : [];
    const decision = decideClaim({
      existing,
      messages,
      incoming: input.incoming,
      userMessage: input.userMessage,
    });
    if (decision.kind === 'start') {
      this.sessions.set(decision.session.id, decision.session);
      this.messages.set(
        messageKey(decision.session.studentUid, decision.session.id),
        decision.messages,
      );
    } else if (decision.kind === 'resume') {
      this.sessions.set(decision.session.id, decision.session);
    }
    return decision;
  }

  async applyComplete(
    studentUid: string,
    sessionId: string,
    assistant: StoredMessage,
    concepts: string[],
  ): Promise<void> {
    const session = await this.getSession(studentUid, sessionId);
    if (!session) return;
    const messages = await this.listMessages(studentUid, sessionId);
    const next = decideComplete(session, messages, assistant);
    next.session.concepts = [...new Set([...session.concepts, ...concepts])].slice(-12);
    this.sessions.set(sessionId, next.session);
    this.messages.set(messageKey(studentUid, sessionId), next.messages);
  }

  async applyAbort(studentUid: string, sessionId: string): Promise<void> {
    const session = await this.getSession(studentUid, sessionId);
    if (!session) return;
    this.sessions.set(sessionId, decideAbort(session));
  }

  async saveSubmission(
    studentUid: string,
    sessionId: string,
    messageId: string,
    submission: PublicSubmission,
  ): Promise<StoredMessage | null> {
    const messages = await this.listMessages(studentUid, sessionId);
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) return null;
    const current = messages[index];
    if (!current) return null;
    if (current.submission) return current;
    const next = { ...current, submission };
    messages[index] = next;
    this.messages.set(messageKey(studentUid, sessionId), messages);
    return next;
  }

  async saveGradingKey(
    studentUid: string,
    sessionId: string,
    messageId: string,
    key: GradingKey,
  ): Promise<void> {
    this.keys.set(`${studentUid}\n${sessionId}\n${messageId}`, key);
  }

  async getGradingKey(studentUid: string, sessionId: string, messageId: string) {
    return this.keys.get(`${studentUid}\n${sessionId}\n${messageId}`) ?? null;
  }

  async getProfile(studentUid: string, fallbackName: string): Promise<LearningProfile> {
    return this.profiles.get(studentUid) ?? emptyLearningProfile(fallbackName);
  }

  async saveProfile(studentUid: string, profile: LearningProfile): Promise<void> {
    this.profiles.set(studentUid, profile);
  }

  async getStats(studentUid: string): Promise<LearningStats> {
    return this.stats.get(studentUid) ?? emptyLearningStats();
  }

  async saveStats(studentUid: string, stats: LearningStats): Promise<void> {
    this.stats.set(studentUid, stats);
  }
}

export function seedLesson(
  store: MemoryStudentStore,
  teacherUid: string,
  lessonId: string,
  lesson: StoredLesson,
) {
  store.lessons.set(lessonKey(teacherUid, lessonId), lesson);
}
