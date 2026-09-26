import type {
  TeacherLessonMetadata,
  TeacherNotes,
  TeachingStyle,
  UserRequirements,
} from './outline-types.js';

const STYLE_GUIDANCE: Record<TeachingStyle, string> = {
  balanced:
    'Balance concise explanations, purposeful visuals, examples, oral questions, and short checks for understanding.',
  visual:
    'Prefer diagrams, illustrations, process visuals, comparisons, and useful interactive visualizations. Reduce unnecessary projected text.',
  'explanation-focused':
    'Prefer clear concept progression, structured explanations, worked examples, and useful teacher talking points. Keep projected text concise.',
  'activity-heavy':
    'Prefer class discussion, oral questions, quick challenges, guided practice, and revision. Do not turn every scene into a quiz.',
};

export function isTeacherLedRequirements(
  requirements: Pick<UserRequirements, 'generationMode' | 'teacherLesson'> | undefined,
): requirements is Pick<UserRequirements, 'generationMode'> & {
  generationMode: 'teacher-led';
  teacherLesson: TeacherLessonMetadata;
} {
  const lesson = requirements?.teacherLesson;
  return Boolean(
    requirements?.generationMode === 'teacher-led' &&
    lesson?.version === 1 &&
    lesson.mode === 'teacher-led' &&
    typeof lesson.subject === 'string' &&
    typeof lesson.grade === 'string' &&
    typeof lesson.topic === 'string' &&
    Number.isInteger(lesson.durationMinutes) &&
    lesson.durationMinutes >= 10 &&
    lesson.durationMinutes <= 180 &&
    lesson.teachingStyle in STYLE_GUIDANCE,
  );
}

export function teacherDurationGuidance(minutes: number): string {
  if (minutes <= 20) return 'Keep scope tight: one core idea, one quick check, and a short recap.';
  if (minutes <= 35)
    return 'Use a focused arc: explanation, an example or visual, a check, and a recap.';
  if (minutes <= 50)
    return 'Use a complete classroom arc: hook, concept development, examples or visuals, discussion/checks, and recap.';
  return 'Use a deeper arc with multiple concept beats, guided practice or discussion, spaced checks, revision, and recap.';
}

/** Keep model-authored teacher support versioned, bounded, and data-only. */
export function normalizeTeacherNotes(value: unknown): TeacherNotes | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return undefined;
  const read = (key: string, max: number) => {
    const raw = record[key];
    if (typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    return trimmed ? trimmed.slice(0, max) : undefined;
  };
  const notes: TeacherNotes = {
    version: 1,
    teacherTip: read('teacherTip', 800),
    commonMisconception: read('commonMisconception', 800),
    discussionPrompt: read('discussionPrompt', 800),
    explanationNote: read('explanationNote', 1200),
  };
  return notes.teacherTip ||
    notes.commonMisconception ||
    notes.discussionPrompt ||
    notes.explanationNote
    ? notes
    : undefined;
}

export function buildTeacherLedPromptContext(requirements: UserRequirements | undefined): string {
  if (!isTeacherLedRequirements(requirements)) return '';
  const lesson = requirements.teacherLesson;
  return [
    '## Teacher-led classroom mode (required)',
    '',
    'The HUMAN TEACHER teaches this lesson in a physical classroom. The AI only prepares projection-ready materials and private teacher support. Do not design an AI tutor monologue or address an individual learner.',
    `Subject: ${lesson.subject}`,
    `Grade: ${lesson.grade}`,
    `Topic: ${lesson.topic}`,
    `Class duration: ${lesson.durationMinutes} minutes`,
    `Curriculum: ${lesson.curriculum || 'Not specified'}`,
    `Teaching style: ${lesson.teachingStyle}`,
    '',
    `Style behavior: ${STYLE_GUIDANCE[lesson.teachingStyle]}`,
    `Pacing behavior: ${teacherDurationGuidance(lesson.durationMinutes)}`,
    '',
    'Select a pedagogically sensible subset of hook, objectives, explanation, visual explanation, examples, discussion, oral questions, checks, revision, quiz, summary, and exit question. Do not force every category into the lesson.',
    'Slides must be concise and readable when projected. Put presenter guidance in teacherNotes, not on the projected slide.',
    'For each outline, optionally include teacherNotes with version 1 and only useful fields: teacherTip, commonMisconception, discussionPrompt, explanationNote. Keep each note concise and teacher-facing.',
    'Avoid PBL unless the validated lesson brief clearly calls for substantial project work; ordinary teacher-led lessons should use slides, quizzes, and at most a small number of useful interactives.',
    'The sum of estimatedDuration values should be reasonably close to the requested class duration.',
    'Do not generate continuous AI speech or AI-teacher narration.',
  ].join('\n');
}
