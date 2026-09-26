import { z } from 'zod';

export const TEACHING_STYLES = [
  'balanced',
  'visual',
  'explanation-focused',
  'activity-heavy',
] as const;

export type TeachingStyle = (typeof TEACHING_STYLES)[number];

export const teacherLessonRequestSchema = z.object({
  subject: z.string().trim().min(1, 'Choose or enter a subject.').max(120),
  grade: z.string().trim().min(1, 'Choose or enter a grade.').max(80),
  topic: z.string().trim().min(1, 'Enter a lesson topic.').max(240),
  durationMinutes: z
    .number()
    .int('Duration must be a whole number of minutes.')
    .min(10, 'Duration must be at least 10 minutes.')
    .max(180, 'Duration must be 180 minutes or less.'),
  curriculum: z.string().trim().max(120).optional(),
  teachingStyle: z.enum(TEACHING_STYLES),
  materialReferences: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
});

export type TeacherLessonRequest = z.infer<typeof teacherLessonRequestSchema>;

export const teacherLessonMetadataSchema = teacherLessonRequestSchema.extend({
  version: z.literal(1),
  mode: z.literal('teacher-led'),
});

export type TeacherLessonMetadata = z.infer<typeof teacherLessonMetadataSchema>;

export const teacherNotesSchema = z.object({
  version: z.literal(1),
  teacherTip: z.string().trim().min(1).max(800).optional(),
  commonMisconception: z.string().trim().min(1).max(800).optional(),
  discussionPrompt: z.string().trim().min(1).max(800).optional(),
  explanationNote: z.string().trim().min(1).max(1200).optional(),
});

export type TeacherNotes = z.infer<typeof teacherNotesSchema>;

export const TEACHING_STYLE_LABELS: Record<TeachingStyle, string> = {
  balanced: 'Balanced',
  visual: 'Visual',
  'explanation-focused': 'Explanation-focused',
  'activity-heavy': 'Activity-heavy',
};

const STYLE_GUIDANCE: Record<TeachingStyle, string> = {
  balanced:
    'Balance concise explanations, purposeful visuals, examples, teacher-led questions, and short checks for understanding.',
  visual:
    'Prioritize diagrams, illustrations, process visuals, comparisons, and useful interactive visualizations. Keep projected text especially brief.',
  'explanation-focused':
    'Prioritize clear concept progression, structured explanations, worked examples, and useful teacher talking points while keeping slides concise.',
  'activity-heavy':
    'Prioritize class discussion, oral questions, quick challenges, guided practice, and revision activities. Do not turn every scene into a quiz.',
};

export function durationGuidance(durationMinutes: number): string {
  if (durationMinutes <= 20) {
    return 'Use a tightly scoped sequence with one core idea, a quick check, and a short recap.';
  }
  if (durationMinutes <= 35) {
    return 'Use a focused sequence with explanation, an example or visual, a check for understanding, and a recap.';
  }
  if (durationMinutes <= 50) {
    return 'Use a complete classroom arc with a hook, concept development, examples or visuals, discussion/checks, and a recap.';
  }
  return 'Use a deeper classroom arc with multiple concept beats, guided practice or discussion, spaced checks for understanding, revision, and a recap.';
}

export function teachingStyleGuidance(style: TeachingStyle): string {
  return STYLE_GUIDANCE[style];
}

function oneLine(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalizeTeacherLessonRequest(input: TeacherLessonRequest): TeacherLessonRequest {
  const parsed = teacherLessonRequestSchema.parse(input);
  return {
    ...parsed,
    subject: oneLine(parsed.subject),
    grade: oneLine(parsed.grade),
    topic: oneLine(parsed.topic),
    ...(parsed.curriculum && parsed.curriculum !== 'Not specified'
      ? { curriculum: oneLine(parsed.curriculum) }
      : { curriculum: undefined }),
    ...(parsed.materialReferences
      ? { materialReferences: parsed.materialReferences.map(oneLine) }
      : {}),
  };
}

export function toTeacherLessonMetadata(request: TeacherLessonRequest): TeacherLessonMetadata {
  return {
    version: 1,
    mode: 'teacher-led',
    ...normalizeTeacherLessonRequest(request),
  };
}

export function parseTeacherLessonMetadata(value: unknown): TeacherLessonMetadata | undefined {
  const result = teacherLessonMetadataSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseTeacherNotes(value: unknown): TeacherNotes | undefined {
  const result = teacherNotesSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

/**
 * The single compatibility boundary from the teacher form to OpenMAIC's
 * existing free-form generation input. Values are validated and normalized
 * before this deterministic representation is produced.
 */
export function compileTeacherLessonRequirement(request: TeacherLessonRequest): string {
  const value = normalizeTeacherLessonRequest(request);
  const curriculum = value.curriculum || 'Not specified';

  return [
    'Create classroom teaching materials for a HUMAN TEACHER to present to students in a physical classroom.',
    'The AI prepares the lesson; the human teacher teaches it. Do not write the lesson as continuous AI narration.',
    '',
    'Validated lesson brief:',
    `- Subject: ${value.subject}`,
    `- Grade: ${value.grade}`,
    `- Topic: ${value.topic}`,
    `- Duration: ${value.durationMinutes} minutes`,
    `- Curriculum: ${curriculum}`,
    `- Teaching style: ${TEACHING_STYLE_LABELS[value.teachingStyle]}`,
    '',
    `Teaching-style guidance: ${teachingStyleGuidance(value.teachingStyle)}`,
    `Duration guidance: ${durationGuidance(value.durationMinutes)}`,
    'Use concise projection-ready content, useful teacher prompts, opportunities for oral participation, checks for understanding, and a purposeful recap. Choose only the lesson components that fit this topic and duration.',
  ].join('\n');
}
