import type { GradeResult, GradingKey, PublicActivity, PublicSubmission } from './types';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function gradeActivity(
  activity: PublicActivity,
  key: GradingKey | null,
  answers: Record<string, string>,
): PublicSubmission {
  const results: GradeResult[] = [];
  let correct = 0;
  let attempted = 0;
  for (const item of activity.items) {
    if (activity.kind === 'flashcards') continue;
    const given = answers[item.id];
    if (typeof given !== 'string' || given.trim() === '') {
      results.push({
        itemId: item.id,
        correct: false,
        feedback: 'This one was left blank.',
      });
      attempted += 1;
      continue;
    }
    const secret = key?.items[item.id];
    const accept = secret?.accept.filter((entry) => entry.trim()) ?? [];
    if (accept.length === 0) {
      results.push({
        itemId: item.id,
        correct: null,
        feedback: 'This answer is saved, but it is not auto-scored.',
      });
      continue;
    }
    const expected = accept.map(normalize);
    const received = normalize(given);
    const matched =
      activity.kind === 'mcq'
        ? expected.includes(received)
        : expected.some((phrase) => phrase.length > 0 && received.includes(phrase));
    attempted += 1;
    if (matched) correct += 1;
    results.push({
      itemId: item.id,
      correct: matched,
      feedback: matched
        ? secret?.explanation || 'That matches the lesson.'
        : secret?.explanation || 'Not quite. Look back at the lesson and try the idea again.',
    });
  }
  return { finishedAt: 0, correct, attempted, results };
}
