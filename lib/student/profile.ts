import type { LearningProfile } from './types';

const LIMITS = {
  displayName: 80,
  gradeLevel: 40,
  subject: 40,
  subjects: 8,
  focus: 200,
} as const;

function cleanLine(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  if (/[\r\n]/.test(value)) return null;
  const text = value.trim();
  if (text.length > max) return null;
  return text;
}

export function emptyLearningProfile(displayName: string): LearningProfile {
  return {
    displayName: displayName.trim().slice(0, LIMITS.displayName) || 'Student',
    gradeLevel: '',
    subjects: [],
    focus: '',
  };
}

/** Rejects extra keys so a client cannot smuggle a role or an age into the profile. */
export function parseLearningProfile(value: unknown): LearningProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowed = new Set(['displayName', 'gradeLevel', 'subjects', 'focus']);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;
  const displayName = cleanLine(record.displayName, LIMITS.displayName);
  const gradeLevel = cleanLine(record.gradeLevel ?? '', LIMITS.gradeLevel);
  const focus = cleanLine(record.focus ?? '', LIMITS.focus);
  if (!displayName || gradeLevel === null || focus === null) return null;
  if (!Array.isArray(record.subjects) || record.subjects.length > LIMITS.subjects) return null;
  const subjects: string[] = [];
  for (const subject of record.subjects) {
    const cleaned = cleanLine(subject, LIMITS.subject);
    if (!cleaned) return null;
    subjects.push(cleaned);
  }
  return { displayName, gradeLevel, subjects, focus };
}
