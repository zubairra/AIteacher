import { describe, expect, it } from 'vitest';
import {
  compileTeacherLessonRequirement,
  durationGuidance,
  parseTeacherLessonMetadata,
  teacherLessonRequestSchema,
  teachingStyleGuidance,
  toTeacherLessonMetadata,
  type TeacherLessonRequest,
} from '@/lib/teacher/lesson-request';

const base: TeacherLessonRequest = {
  subject: 'Chemistry',
  grade: 'Grade 8',
  topic: 'Structure of the Atom',
  durationMinutes: 40,
  curriculum: 'CBSE',
  teachingStyle: 'balanced',
};

describe('TeacherLessonRequest', () => {
  it('validates the acceptance-test request and rejects missing topics', () => {
    expect(teacherLessonRequestSchema.safeParse(base).success).toBe(true);
    expect(teacherLessonRequestSchema.safeParse({ ...base, topic: '  ' }).success).toBe(false);
  });

  it('normalizes duration to bounded whole minutes', () => {
    expect(teacherLessonRequestSchema.safeParse({ ...base, durationMinutes: 20 }).success).toBe(
      true,
    );
    expect(teacherLessonRequestSchema.safeParse({ ...base, durationMinutes: 20.5 }).success).toBe(
      false,
    );
    expect(teacherLessonRequestSchema.safeParse({ ...base, durationMinutes: 181 }).success).toBe(
      false,
    );
  });

  it('compiles one deterministic teacher-led requirement for the existing pipeline', () => {
    const compiled = compileTeacherLessonRequirement(base);
    expect(compiled).toContain('HUMAN TEACHER');
    expect(compiled).toContain('- Subject: Chemistry');
    expect(compiled).toContain('- Grade: Grade 8');
    expect(compiled).toContain('- Topic: Structure of the Atom');
    expect(compiled).toContain('- Duration: 40 minutes');
    expect(compiled).toContain('- Curriculum: CBSE');
    expect(compiled).toContain('Do not write the lesson as continuous AI narration');
  });

  it('maps all four teaching styles to measurably different instructions', () => {
    const values = ['balanced', 'visual', 'explanation-focused', 'activity-heavy'] as const;
    const guidance = values.map(teachingStyleGuidance);
    expect(new Set(guidance).size).toBe(4);
    expect(guidance[1]).toContain('diagrams');
    expect(guidance[2]).toContain('worked examples');
    expect(guidance[3]).toContain('class discussion');
  });

  it('changes pacing guidance by requested duration', () => {
    expect(durationGuidance(20)).toContain('tightly scoped');
    expect(durationGuidance(40)).toContain('complete classroom arc');
    expect(durationGuidance(60)).toContain('deeper classroom arc');
  });

  it('serializes versioned metadata and safely ignores legacy or malformed values', () => {
    const metadata = toTeacherLessonMetadata(base);
    expect(parseTeacherLessonMetadata(metadata)).toEqual(metadata);
    expect(parseTeacherLessonMetadata(undefined)).toBeUndefined();
    expect(parseTeacherLessonMetadata({ ...metadata, version: 2 })).toBeUndefined();
  });
});
