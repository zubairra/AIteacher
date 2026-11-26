/** Shared student-tutor types. Server routes and the UI both import these. */

export const TUTOR_MODES = ['explain', 'step', 'practice', 'revision', 'exam'] as const;

export type TutorMode = (typeof TUTOR_MODES)[number];

export const TUTOR_MODE_LABELS: Record<TutorMode, string> = {
  explain: 'Explain',
  step: 'Step-by-Step',
  practice: 'Practice',
  revision: 'Revision',
  exam: 'Exam',
};

export function isTutorMode(value: unknown): value is TutorMode {
  return typeof value === 'string' && (TUTOR_MODES as readonly string[]).includes(value);
}

export interface ActivityOption {
  id: string;
  text: string;
}

export interface PublicActivityItem {
  id: string;
  prompt: string;
  options?: ActivityOption[];
  /** Flashcards only. Hidden in the UI until the student flips the card. */
  front?: string;
  back?: string;
}

export interface PublicActivity {
  kind: 'mcq' | 'short' | 'flashcards';
  items: PublicActivityItem[];
}

export interface GradeResult {
  itemId: string;
  /** `null` means the item was not auto-scored. It is not a pass or a fail. */
  correct: boolean | null;
  feedback: string;
}

export interface PublicSubmission {
  finishedAt: number;
  correct: number;
  attempted: number;
  results: GradeResult[];
}

export interface PublicMessage {
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

/** Server-only answer key. Never copied onto a PublicMessage. */
export interface GradingKey {
  items: Record<string, { accept: string[]; explanation: string }>;
}

export interface LearningProfile {
  displayName: string;
  gradeLevel: string;
  subjects: string[];
  focus: string;
}

export interface LessonTopicStat {
  practised: number;
  correct: number;
  incorrect: number;
}

export interface LessonProgress {
  grantId: string;
  title: string;
  subject: string;
  topic: string;
  turns: number;
  lastAt: number;
  examsFinished: number;
}

export interface RecentActivity {
  at: number;
  label: string;
  grantId: string;
}

export interface LearningStats {
  version: 1;
  lessons: Record<string, LessonProgress>;
  quizAttempted: number;
  quizCorrect: number;
  /** UTC dates (YYYY-MM-DD) with at least one saved tutor turn or scored attempt. */
  days: string[];
  recent: RecentActivity[];
  topics: Record<string, LessonTopicStat>;
}

export interface GroundedLesson {
  title: string;
  subject: string;
  grade: string;
  topic: string;
  excerpt: string;
  /** False when there is no extractable lesson body. The tutor must not invent it. */
  available: boolean;
  gapNote: string;
}
