import { gradeActivity } from '@/lib/student/activity';
import { groundLesson } from '@/lib/student/lesson-grounding';
import { interpretTutorOutput, visibleStreamText } from '@/lib/student/interpret';
import { buildTutorTranscript } from '@/lib/student/prompt';
import { emptyLearningStats, recordGrade, recordTurn } from '@/lib/student/progress';
import type { LearningStats, PublicMessage, TutorMode } from '@/lib/student/types';
import { isClientMessageId, isSessionId } from '@/lib/student/nav';
import type { StoredMessage, StudentStore, TutorSessionRecord } from '@/lib/student/turn-types';

export interface TutorChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorModel {
  generate?(input: {
    system: string;
    messages: TutorChatMessage[];
    signal?: AbortSignal;
  }): Promise<string>;
  stream?(input: {
    system: string;
    messages: TutorChatMessage[];
    signal?: AbortSignal;
  }): AsyncIterable<string>;
}

export interface QuotaReservation {
  ok: true;
  release: () => Promise<void>;
}

export type TurnFailure = { ok: false; status: number; code: string; error: string };

export type TurnSuccess = {
  ok: true;
  status: 200;
  sessionId: string;
  userMessage: PublicMessage;
  assistantMessage: PublicMessage;
};

export function toPublicMessage(message: StoredMessage): PublicMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    mode: message.mode,
    createdAt: message.createdAt,
    ...(message.clientMessageId ? { clientMessageId: message.clientMessageId } : {}),
    ...(message.followUps?.length ? { followUps: message.followUps } : {}),
    ...(message.activity ? { activity: message.activity } : {}),
    ...(message.submission ? { submission: message.submission } : {}),
  };
}

interface PreparedTurn {
  sessionId: string;
  userMessage: StoredMessage;
  system: string;
  messages: TutorChatMessage[];
  mode: TutorMode;
  topic: string;
  grantId: string;
  title: string;
  subject: string;
  release: () => Promise<void>;
}

type PrepareResult = { ok: true; prepared: PreparedTurn } | TurnFailure | TurnSuccess;

function failure(status: number, code: string, error: string): TurnFailure {
  return { ok: false, status, code, error };
}

async function prepareTurn(
  deps: {
    store: StudentStore;
    reserve: (
      studentUid: string,
    ) => Promise<QuotaReservation | { ok: false; scope: 'student' | 'global' }>;
    now: () => number;
    newId: (prefix: string) => string;
  },
  input: {
    studentUid: string;
    studentName: string;
    grantId: string;
    sessionId?: string;
    mode: TutorMode;
    text: string;
    clientMessageId: string;
  },
): Promise<PrepareResult> {
  const text = input.text.trim();
  if (!text || text.length > 4000)
    return failure(400, 'INVALID_REQUEST', 'Write a message under 4000 characters.');
  if (!isClientMessageId(input.clientMessageId)) {
    return failure(400, 'INVALID_REQUEST', 'That message could not be saved.');
  }
  const grant = await deps.store.getGrant(input.studentUid, input.grantId);
  if (!grant || grant.studentUid !== input.studentUid) {
    return failure(404, 'NOT_FOUND', 'That lesson is not on your account.');
  }

  let session: TutorSessionRecord;
  if (input.sessionId) {
    if (!isSessionId(input.sessionId))
      return failure(404, 'NOT_FOUND', 'That conversation was not found.');
    const existing = await deps.store.getSession(input.studentUid, input.sessionId);
    if (!existing || existing.grantId !== grant.id) {
      return failure(404, 'NOT_FOUND', 'That conversation was not found.');
    }
    session = { ...existing, mode: input.mode };
  } else {
    const now = deps.now();
    session = {
      id: deps.newId('ses'),
      studentUid: input.studentUid,
      grantId: grant.id,
      mode: input.mode,
      title: grant.title,
      createdAt: now,
      updatedAt: now,
      inflightClientMessageId: null,
      concepts: [],
    };
  }

  const userMessage: StoredMessage = {
    id: deps.newId('msg'),
    role: 'user',
    text,
    mode: input.mode,
    createdAt: deps.now(),
    clientMessageId: input.clientMessageId,
  };
  const claim = await deps.store.applyClaim({ incoming: session, userMessage });
  if (claim.kind === 'forbidden')
    return failure(404, 'NOT_FOUND', 'That conversation was not found.');
  if (claim.kind === 'busy') {
    return failure(409, 'CONFLICT', 'That message is already being sent.');
  }
  if (claim.kind === 'replay') {
    return {
      ok: true,
      status: 200,
      sessionId: claim.session.id,
      userMessage: toPublicMessage(claim.userMessage),
      assistantMessage: toPublicMessage(claim.assistantMessage),
    };
  }

  const reservation = await deps.reserve(input.studentUid);
  if (!reservation.ok) {
    await deps.store.applyAbort(input.studentUid, claim.session.id);
    const error =
      reservation.scope === 'global'
        ? 'The tutor is busy today. Please try again tomorrow.'
        : "You've reached today's tutor limit. Saved conversations are still available.";
    return failure(429, 'RATE_LIMITED', error);
  }

  const lesson = await deps.store.getLesson(grant.teacherUid, grant.lessonId);
  const grounded = groundLesson({
    stage: lesson?.stage ?? null,
    scenes: lesson?.scenes ?? [],
  });
  if (lesson) {
    grounded.title = lesson.title || grounded.title;
    grounded.subject = lesson.subject || grounded.subject;
    grounded.grade = lesson.grade || grounded.grade;
    grounded.topic = lesson.topic || grounded.topic;
  }
  const profile = await deps.store.getProfile(input.studentUid, input.studentName);
  const stats = await deps.store.getStats(input.studentUid);
  const history = (await deps.store.listMessages(input.studentUid, claim.session.id))
    .filter((message) => message.id !== claim.userMessage.id)
    .slice(-12)
    .map((message) => ({ role: message.role, text: message.text }));
  const transcript = buildTutorTranscript({
    mode: input.mode,
    lesson: grounded,
    profile,
    weakTopics: Object.entries(stats.topics)
      .filter(([, topic]) => topic.practised >= 2 && topic.incorrect > topic.correct)
      .map(([name]) => name)
      .slice(0, 6),
    discussed: claim.session.concepts,
    history,
    studentText: claim.userMessage.text,
  });

  return {
    ok: true,
    prepared: {
      sessionId: claim.session.id,
      userMessage: claim.userMessage,
      system: transcript.system,
      messages: transcript.messages,
      mode: input.mode,
      topic: grounded.topic || grant.topic,
      grantId: grant.id,
      title: grant.title,
      subject: grant.subject,
      release: reservation.release,
    },
  };
}

async function finishTurn(
  deps: { store: StudentStore; now: () => number; newId: (prefix: string) => string },
  input: { studentUid: string },
  prepared: PreparedTurn,
  raw: string,
): Promise<TurnSuccess | TurnFailure> {
  const interpreted = interpretTutorOutput(prepared.mode, raw, prepared.topic);
  if (!interpreted.ok) {
    await deps.store.applyAbort(input.studentUid, prepared.sessionId);
    await prepared.release();
    return failure(
      502,
      interpreted.reason === 'malformed-exam' ? 'MALFORMED_EXAM' : 'EMPTY_RESPONSE',
      interpreted.reason === 'malformed-exam'
        ? 'The exam could not be prepared. Try again.'
        : 'The tutor returned an empty reply. Try again.',
    );
  }
  const assistant: StoredMessage = {
    id: deps.newId('msg'),
    role: 'assistant',
    text: interpreted.text,
    mode: prepared.mode,
    createdAt: deps.now(),
    ...(interpreted.followUps.length ? { followUps: interpreted.followUps } : {}),
    ...(interpreted.activity ? { activity: interpreted.activity } : {}),
  };
  await deps.store.applyComplete(
    input.studentUid,
    prepared.sessionId,
    assistant,
    interpreted.concepts,
  );
  if (interpreted.gradingKey) {
    await deps.store.saveGradingKey(
      input.studentUid,
      prepared.sessionId,
      assistant.id,
      interpreted.gradingKey,
    );
  }
  const stats = await deps.store.getStats(input.studentUid);
  await deps.store.saveStats(
    input.studentUid,
    recordTurn(stats.version === 1 ? stats : emptyLearningStats(), {
      at: assistant.createdAt,
      grantId: prepared.grantId,
      title: prepared.title,
      subject: prepared.subject,
      topic: prepared.topic,
      concepts: interpreted.concepts,
      label: `${prepared.mode}: ${prepared.topic}`,
    }),
  );
  return {
    ok: true,
    status: 200,
    sessionId: prepared.sessionId,
    userMessage: toPublicMessage(prepared.userMessage),
    assistantMessage: toPublicMessage(assistant),
  };
}

export async function submitTutorTurn(
  deps: {
    store: StudentStore;
    model: TutorModel;
    reserve: (
      studentUid: string,
    ) => Promise<QuotaReservation | { ok: false; scope: 'student' | 'global' }>;
    now: () => number;
    newId: (prefix: string) => string;
    onError?: (error: unknown) => void;
  },
  input: {
    studentUid: string;
    studentName: string;
    grantId: string;
    sessionId?: string;
    mode: TutorMode;
    text: string;
    clientMessageId: string;
    signal?: AbortSignal;
  },
): Promise<TurnSuccess | TurnFailure> {
  const prepared = await prepareTurn(deps, input);
  if (!('prepared' in prepared)) return prepared;
  try {
    if (!deps.model.generate)
      return failure(502, 'PROVIDER', 'The tutor could not reply. Try again.');
    const raw = await deps.model.generate({
      system: prepared.prepared.system,
      messages: prepared.prepared.messages,
      signal: input.signal,
    });
    return await finishTurn(deps, input, prepared.prepared, raw);
  } catch (error) {
    deps.onError?.(error);
    await deps.store.applyAbort(input.studentUid, prepared.prepared.sessionId);
    await prepared.prepared.release();
    if (input.signal?.aborted) return failure(499, 'ABORTED', 'Stopped.');
    return failure(502, 'PROVIDER', 'The tutor could not reply. Try again.');
  }
}

export async function streamTutorTurn(
  deps: {
    store: StudentStore;
    model: TutorModel;
    reserve: (
      studentUid: string,
    ) => Promise<QuotaReservation | { ok: false; scope: 'student' | 'global' }>;
    now: () => number;
    newId: (prefix: string) => string;
    onError?: (error: unknown) => void;
  },
  input: {
    studentUid: string;
    studentName: string;
    grantId: string;
    sessionId?: string;
    mode: TutorMode;
    text: string;
    clientMessageId: string;
    signal?: AbortSignal;
  },
  onDelta: (text: string) => void,
): Promise<TurnSuccess | TurnFailure> {
  const prepared = await prepareTurn(deps, input);
  if (!('prepared' in prepared)) return prepared;
  let raw = '';
  try {
    const stream = deps.model.stream;
    if (!stream) {
      if (!deps.model.generate)
        return failure(502, 'PROVIDER', 'The tutor could not reply. Try again.');
      raw = await deps.model.generate({
        system: prepared.prepared.system,
        messages: prepared.prepared.messages,
        signal: input.signal,
      });
      return await finishTurn(deps, input, prepared.prepared, raw);
    }
    for await (const chunk of stream({
      system: prepared.prepared.system,
      messages: prepared.prepared.messages,
      signal: input.signal,
    })) {
      raw += chunk;
      onDelta(visibleStreamText(raw));
    }
    return await finishTurn(deps, input, prepared.prepared, raw);
  } catch (error) {
    deps.onError?.(error);
    await deps.store.applyAbort(input.studentUid, prepared.prepared.sessionId);
    await prepared.prepared.release();
    if (input.signal?.aborted) return failure(499, 'ABORTED', 'Stopped.');
    return failure(502, 'PROVIDER', 'The tutor could not reply. Try again.');
  }
}

export async function gradeTutorMessage(
  deps: { store: StudentStore; now: () => number },
  input: {
    studentUid: string;
    sessionId: string;
    messageId: string;
    answers: Record<string, string>;
  },
): Promise<{ ok: true; message: PublicMessage; stats: LearningStats } | TurnFailure> {
  const session = await deps.store.getSession(input.studentUid, input.sessionId);
  if (!session) return failure(404, 'NOT_FOUND', 'That conversation was not found.');
  const grant = await deps.store.getGrant(input.studentUid, session.grantId);
  if (!grant) return failure(404, 'NOT_FOUND', 'That lesson is not on your account.');
  const messages = await deps.store.listMessages(input.studentUid, input.sessionId);
  const message = messages.find((item) => item.id === input.messageId);
  if (!message?.activity)
    return failure(400, 'INVALID_REQUEST', 'That message has nothing to mark.');
  if (message.submission)
    return {
      ok: true,
      message: toPublicMessage(message),
      stats: await deps.store.getStats(input.studentUid),
    };

  const key = await deps.store.getGradingKey(input.studentUid, input.sessionId, message.id);
  const submission = gradeActivity(message.activity, key, input.answers);
  submission.finishedAt = deps.now();
  const saved = await deps.store.saveSubmission(
    input.studentUid,
    input.sessionId,
    message.id,
    submission,
  );
  if (!saved?.submission) return failure(404, 'NOT_FOUND', 'That message has nothing to mark.');
  if (saved.submission.finishedAt !== submission.finishedAt) {
    return {
      ok: true,
      message: toPublicMessage(saved),
      stats: await deps.store.getStats(input.studentUid),
    };
  }
  const scored = saved.submission.results.filter((result) => typeof result.correct === 'boolean');
  const correct = scored.filter((result) => result.correct).length;
  const examFinished =
    message.mode === 'exam' &&
    scored.length > 0 &&
    scored.length === saved.submission.results.length;
  const stats = recordGrade(await deps.store.getStats(input.studentUid), {
    at: submission.finishedAt,
    grantId: grant.id,
    title: grant.title,
    subject: grant.subject,
    topic: grant.topic,
    topicLabel: grant.topic || grant.title,
    correct,
    attempted: scored.length,
    examFinished,
    label: examFinished
      ? `Exam on ${grant.topic || grant.title}`
      : `Practice on ${grant.topic || grant.title}`,
  });
  await deps.store.saveStats(input.studentUid, stats);
  return { ok: true, message: toPublicMessage(saved), stats };
}
