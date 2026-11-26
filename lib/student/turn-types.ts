import type {
  GradingKey,
  LearningProfile,
  LearningStats,
  PublicActivity,
  PublicSubmission,
  TutorMode,
} from './types';

export type ClaimDecision =
  | { kind: 'forbidden' }
  | { kind: 'busy' }
  | {
      kind: 'replay';
      session: TutorSessionRecord;
      userMessage: StoredMessage;
      assistantMessage: StoredMessage;
    }
  | { kind: 'resume'; session: TutorSessionRecord; userMessage: StoredMessage }
  | {
      kind: 'start';
      session: TutorSessionRecord;
      messages: StoredMessage[];
      userMessage: StoredMessage;
    };

export interface TutorSessionRecord {
  id: string;
  studentUid: string;
  grantId: string;
  mode: TutorMode;
  title: string;
  createdAt: number;
  updatedAt: number;
  inflightClientMessageId: string | null;
  concepts: string[];
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  mode: TutorMode;
  createdAt: number;
  clientMessageId?: string;
  followUps?: string[];
  activity?: PublicActivity;
  submission?: PublicSubmission;
}

export interface LessonGrant {
  id: string;
  studentUid: string;
  teacherUid: string;
  lessonId: string;
  title: string;
  subject: string;
  grade: string;
  topic: string;
  classId: string | null;
  sharedAt: number;
}

export interface StoredLesson {
  title: string;
  subject: string;
  grade: string;
  topic: string;
  stage: Record<string, unknown> | null;
  scenes: unknown[];
}

export interface ClassLessonRef {
  lessonId: string;
  title: string;
  teacherUid: string;
}

export interface StudentStore {
  getLesson(teacherUid: string, lessonId: string): Promise<StoredLesson | null>;
  getOrCreateClassroom(
    teacherUid: string,
    now: number,
  ): Promise<{ classId: string; joinCode: string; name: string }>;
  addClassLesson(classId: string, lesson: ClassLessonRef, now: number): Promise<void>;
  listClassLessons(classId: string): Promise<ClassLessonRef[]>;
  listMemberUids(classId: string): Promise<string[]>;
  lookupJoinCode(
    code: string,
  ): Promise<{ classId: string; teacherUid: string; name: string } | null>;
  addMember(classId: string, studentUid: string, now: number): Promise<void>;
  saveShare(share: {
    token: string;
    teacherUid: string;
    lessonId: string;
    createdAt: number;
  }): Promise<void>;
  findShareByLesson(teacherUid: string, lessonId: string): Promise<{ token: string } | null>;
  getShare(token: string): Promise<{ token: string; teacherUid: string; lessonId: string } | null>;
  putGrant(grant: LessonGrant): Promise<void>;
  getGrant(studentUid: string, grantId: string): Promise<LessonGrant | null>;
  listGrants(studentUid: string): Promise<LessonGrant[]>;
  getSession(studentUid: string, sessionId: string): Promise<TutorSessionRecord | null>;
  listSessions(studentUid: string): Promise<TutorSessionRecord[]>;
  listMessages(studentUid: string, sessionId: string): Promise<StoredMessage[]>;
  applyClaim(input: {
    incoming: TutorSessionRecord;
    userMessage: StoredMessage;
  }): Promise<ClaimDecision>;
  applyComplete(
    studentUid: string,
    sessionId: string,
    assistant: StoredMessage,
    concepts: string[],
  ): Promise<void>;
  applyAbort(studentUid: string, sessionId: string): Promise<void>;
  saveSubmission(
    studentUid: string,
    sessionId: string,
    messageId: string,
    submission: PublicSubmission,
  ): Promise<StoredMessage | null>;
  saveGradingKey(
    studentUid: string,
    sessionId: string,
    messageId: string,
    key: GradingKey,
  ): Promise<void>;
  getGradingKey(
    studentUid: string,
    sessionId: string,
    messageId: string,
  ): Promise<GradingKey | null>;
  getProfile(studentUid: string, fallbackName: string): Promise<LearningProfile>;
  saveProfile(studentUid: string, profile: LearningProfile): Promise<void>;
  getStats(studentUid: string): Promise<LearningStats>;
  saveStats(studentUid: string, stats: LearningStats): Promise<void>;
}
