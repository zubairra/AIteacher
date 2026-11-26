import type { LearningStats, LessonProgress, LessonTopicStat } from './types';
import { oneLine } from './untrusted';
import { utcDay } from './quota';

const MAX_DAYS = 120;
const MAX_RECENT = 12;
const MAX_TOPICS = 24;

export function emptyLearningStats(): LearningStats {
  return {
    version: 1,
    lessons: {},
    quizAttempted: 0,
    quizCorrect: 0,
    days: [],
    recent: [],
    topics: {},
  };
}

function withDay(days: string[], day: string): string[] {
  const next = days.includes(day) ? days : [...days, day];
  return next.sort().slice(-MAX_DAYS);
}

function cleanTopic(value: string): string | null {
  const text = oneLine(value, 40);
  if (text.length < 2) return null;
  if (/ignore|system prompt|api key|password/i.test(text)) return null;
  return text;
}

export function recordTurn(
  stats: LearningStats,
  event: {
    at: number;
    grantId: string;
    title: string;
    subject: string;
    topic: string;
    concepts?: string[];
    label: string;
  },
): LearningStats {
  const lesson: LessonProgress = stats.lessons[event.grantId] ?? {
    grantId: event.grantId,
    title: event.title,
    subject: event.subject,
    topic: event.topic,
    turns: 0,
    lastAt: 0,
    examsFinished: 0,
  };
  const topics = { ...stats.topics };
  for (const concept of event.concepts ?? []) {
    const name = cleanTopic(concept);
    if (!name) continue;
    const current = topics[name] ?? { practised: 0, correct: 0, incorrect: 0 };
    if (!topics[name] && Object.keys(topics).length >= MAX_TOPICS) continue;
    topics[name] = { ...current, practised: current.practised + 1 };
  }
  return {
    ...stats,
    lessons: {
      ...stats.lessons,
      [event.grantId]: { ...lesson, turns: lesson.turns + 1, lastAt: event.at },
    },
    days: withDay(stats.days, utcDay(event.at)),
    recent: [
      { at: event.at, label: oneLine(event.label, 120), grantId: event.grantId },
      ...stats.recent,
    ].slice(0, MAX_RECENT),
    topics,
  };
}

export function recordGrade(
  stats: LearningStats,
  event: {
    at: number;
    grantId: string;
    title: string;
    subject: string;
    topic: string;
    topicLabel: string;
    correct: number;
    attempted: number;
    examFinished: boolean;
    label: string;
  },
): LearningStats {
  const lesson: LessonProgress = stats.lessons[event.grantId] ?? {
    grantId: event.grantId,
    title: event.title,
    subject: event.subject,
    topic: event.topic,
    turns: 0,
    lastAt: 0,
    examsFinished: 0,
  };
  const topics = { ...stats.topics };
  const topicName = cleanTopic(event.topicLabel);
  if (topicName && event.attempted > 0) {
    const current: LessonTopicStat = topics[topicName] ?? {
      practised: 0,
      correct: 0,
      incorrect: 0,
    };
    if (topics[topicName] || Object.keys(topics).length < MAX_TOPICS) {
      topics[topicName] = {
        practised: current.practised + event.attempted,
        correct: current.correct + event.correct,
        incorrect: current.incorrect + Math.max(0, event.attempted - event.correct),
      };
    }
  }
  return {
    ...stats,
    lessons: {
      ...stats.lessons,
      [event.grantId]: {
        ...lesson,
        lastAt: event.at,
        examsFinished: lesson.examsFinished + (event.examFinished ? 1 : 0),
      },
    },
    quizAttempted: stats.quizAttempted + event.attempted,
    quizCorrect: stats.quizCorrect + event.correct,
    days: withDay(stats.days, utcDay(event.at)),
    recent: [
      { at: event.at, label: oneLine(event.label, 120), grantId: event.grantId },
      ...stats.recent,
    ].slice(0, MAX_RECENT),
    topics,
  };
}

/**
 * Consecutive UTC days ending today, or yesterday when today has no activity yet.
 * A gap ends the streak. An empty list is 0.
 */
export function streakEnding(days: string[], todayUtc: string): number {
  const present = new Set(days);
  const cursor = new Date(`${todayUtc}T00:00:00.000Z`);
  if (!present.has(todayUtc)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  for (;;) {
    const day = cursor.toISOString().slice(0, 10);
    if (!present.has(day)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function strengthsAndWeaknesses(stats: LearningStats): {
  strengths: string[];
  weak: string[];
} {
  const strengths: string[] = [];
  const weak: string[] = [];
  for (const [topic, stat] of Object.entries(stats.topics)) {
    if (stat.correct >= 2 && stat.correct > stat.incorrect) strengths.push(topic);
    if (stat.practised >= 2 && stat.incorrect > stat.correct) weak.push(topic);
  }
  return { strengths: strengths.sort(), weak: weak.sort() };
}

export interface ProgressViewModel {
  lessonsOpened: number;
  lessonsCompleted: number;
  topicsPractised: number;
  quizAttempted: number;
  quizCorrect: number;
  quizPercent: number | null;
  streak: number;
  showStreak: boolean;
  strengths: string[];
  weak: string[];
  recent: LearningStats['recent'];
}

export function buildProgressView(stats: LearningStats, now: number): ProgressViewModel {
  const { strengths, weak } = strengthsAndWeaknesses(stats);
  const streak = streakEnding(stats.days, utcDay(now));
  return {
    lessonsOpened: Object.keys(stats.lessons).length,
    lessonsCompleted: Object.values(stats.lessons).filter((lesson) => lesson.examsFinished > 0)
      .length,
    topicsPractised: Object.keys(stats.topics).length,
    quizAttempted: stats.quizAttempted,
    quizCorrect: stats.quizCorrect,
    quizPercent:
      stats.quizAttempted > 0 ? Math.round((stats.quizCorrect / stats.quizAttempted) * 100) : null,
    streak,
    showStreak: streak > 0,
    strengths,
    weak,
    recent: stats.recent,
  };
}

/** Server clock for a progress read. Kept out of the page component so the render stays a pure projection of stored stats plus this instant. */
export function viewProgress(stats: LearningStats): ProgressViewModel {
  return buildProgressView(stats, Date.now());
}
