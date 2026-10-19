import type { QuizQuestion } from '@/lib/types/stage';
import { gradeChoiceQuestions } from '@/lib/quiz/grading';
import {
  parseNativeActivity,
  type NativeActivityDefinition,
} from '@/lib/teacher/native-activities';

export const JOIN_CODE_LENGTH = 6;
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const SECRET_KEYS = new Set([
  'correctOptionIds',
  'answer',
  'correctOrder',
  'categoryId',
  'analysis',
  'explanation',
  'hint',
  'commentPrompt',
  'pairs',
]);

export interface PublicOption {
  id: string;
  label: string;
}

export type PublicPrompt =
  | { kind: 'choice'; id: string; prompt: string; multi: boolean; options: PublicOption[] }
  | { kind: 'true-false'; id: string; prompt: string }
  | {
      kind: 'match';
      id: string;
      prompt: string;
      left: PublicOption[];
      right: PublicOption[];
    }
  | {
      kind: 'sort';
      id: string;
      prompt: string;
      categories: PublicOption[];
      items: PublicOption[];
    }
  | { kind: 'order'; id: string; prompt: string; items: PublicOption[] }
  | { kind: 'text'; id: string; prompt: string };

export type AnswerKey =
  | { kind: 'choice'; correctOptionIds: string[] }
  | { kind: 'true-false'; answer: boolean }
  | { kind: 'match'; pairs: Array<{ leftId: string; rightId: string }> }
  | { kind: 'sort'; placements: Array<{ itemId: string; categoryId: string }> }
  | { kind: 'order'; itemIds: string[] }
  | { kind: 'text' };

export type StudentAnswer =
  | { kind: 'choice'; optionIds: string[] }
  | { kind: 'true-false'; value: boolean }
  | { kind: 'match'; pairs: Array<{ leftId: string; rightId: string }> }
  | { kind: 'sort'; placements: Array<{ itemId: string; categoryId: string }> }
  | { kind: 'order'; itemIds: string[] }
  | { kind: 'text'; text: string };

export interface LivePromptSet {
  prompts: PublicPrompt[];
  keys: Record<string, AnswerKey>;
}

export interface LiveSceneSource {
  id: string;
  type?: string;
  title?: string;
  nativeActivity?: unknown;
  content?: { type?: string; questions?: QuizQuestion[] };
}

export interface LiveTallyRow {
  id: string;
  label: string;
  count: number;
}

export interface LiveResultPrompt {
  id: string;
  prompt: string;
  responseCount: number;
  correctCount: number;
  ungradedCount: number;
  tally: LiveTallyRow[];
}

export interface LiveResultStudent {
  displayName: string;
  promptId: string;
  /** Null when the response is ungraded text. Text is the student's writing, not an answer key. */
  correct: boolean | null;
  text?: string;
}

export interface LiveResultRecord {
  version: 1;
  code: string;
  lessonId: string;
  sceneId: string;
  sceneTitle: string;
  closedAt: number;
  responseCount: number;
  prompts: LiveResultPrompt[];
  students: LiveResultStudent[];
}

export interface StoredResponse {
  displayName: string;
  answers: Record<string, StudentAnswer>;
}

export function createJoinCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
    code += JOIN_CODE_ALPHABET[Math.floor(random() * JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeJoinCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, JOIN_CODE_LENGTH);
}

export function joinCodeIsValid(value: string): boolean {
  return (
    value.length === JOIN_CODE_LENGTH &&
    [...value].every((char) => JOIN_CODE_ALPHABET.includes(char))
  );
}

/** Paths that contain answer keys are teacher-only. Session documents must not use them. */
export function findSecretKeys(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSecretKeys(item, `${path}[${index}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const here = path ? `${path}.${key}` : key;
    return SECRET_KEYS.has(key) ? [here] : findSecretKeys(child, here);
  });
}

export function assertPublicPrompts(prompts: PublicPrompt[]): void {
  const leaks = findSecretKeys(prompts);
  if (leaks.length > 0) {
    throw new Error(`Live prompt leaked answer fields: ${leaks.join(', ')}`);
  }
}

export function livePromptsFromScene(
  scene: LiveSceneSource,
  random: () => number = Math.random,
): LivePromptSet {
  const activity = parseNativeActivity(scene.nativeActivity);
  if (activity && isCollectedActivity(activity)) {
    return buildActivityPrompts(scene.id, activity, random);
  }
  if (scene.content?.type === 'quiz' && Array.isArray(scene.content.questions)) {
    return buildQuizPrompts(scene.id, scene.content.questions);
  }
  return { prompts: [], keys: {} };
}

export function gradeLiveAnswer(key: AnswerKey, answer: StudentAnswer): boolean | null {
  if (key.kind === 'text' || answer.kind === 'text') {
    return key.kind === 'text' && answer.kind === 'text' ? null : false;
  }
  if (key.kind === 'choice' && answer.kind === 'choice') {
    return gradeChoiceKey(key.correctOptionIds, answer.optionIds);
  }
  if (key.kind === 'true-false' && answer.kind === 'true-false') {
    return answer.value === key.answer;
  }
  if (key.kind === 'match' && answer.kind === 'match') {
    const expected = new Map(key.pairs.map((pair) => [pair.leftId, pair.rightId]));
    if (answer.pairs.length !== expected.size) return false;
    const seen = new Set<string>();
    return answer.pairs.every((pair) => {
      if (seen.has(pair.leftId)) return false;
      seen.add(pair.leftId);
      return expected.get(pair.leftId) === pair.rightId;
    });
  }
  if (key.kind === 'sort' && answer.kind === 'sort') {
    const expected = new Map(key.placements.map((item) => [item.itemId, item.categoryId]));
    if (answer.placements.length !== expected.size) return false;
    return answer.placements.every((item) => expected.get(item.itemId) === item.categoryId);
  }
  if (key.kind === 'order' && answer.kind === 'order') {
    return (
      answer.itemIds.length === key.itemIds.length &&
      answer.itemIds.every((id, index) => id === key.itemIds[index])
    );
  }
  return false;
}

export function tallyPrompt(prompt: PublicPrompt, answers: StudentAnswer[]): LiveTallyRow[] {
  if (prompt.kind === 'choice') {
    return prompt.options.map((option) => ({
      id: option.id,
      label: option.label,
      count: answers.filter(
        (answer) => answer.kind === 'choice' && answer.optionIds.includes(option.id),
      ).length,
    }));
  }
  if (prompt.kind === 'true-false') {
    return [
      {
        id: 'true',
        label: 'True',
        count: answers.filter((answer) => answer.kind === 'true-false' && answer.value).length,
      },
      {
        id: 'false',
        label: 'False',
        count: answers.filter((answer) => answer.kind === 'true-false' && !answer.value).length,
      },
    ];
  }
  if (prompt.kind === 'text') {
    return [
      {
        id: 'text',
        label: 'Written answers',
        count: answers.filter((a) => a.kind === 'text').length,
      },
    ];
  }
  return [{ id: 'submitted', label: 'Submitted', count: answers.length }];
}

export function correctLabels(prompt: PublicPrompt, key: AnswerKey): string[] {
  if (prompt.kind === 'choice' && key.kind === 'choice') {
    const labels = new Map(prompt.options.map((option) => [option.id, option.label]));
    return key.correctOptionIds.map((id) => labels.get(id) ?? id);
  }
  if (prompt.kind === 'true-false' && key.kind === 'true-false') {
    return [key.answer ? 'True' : 'False'];
  }
  if (prompt.kind === 'match' && key.kind === 'match') {
    const left = new Map(prompt.left.map((option) => [option.id, option.label]));
    const right = new Map(prompt.right.map((option) => [option.id, option.label]));
    return key.pairs.map(
      (pair) =>
        `${left.get(pair.leftId) ?? pair.leftId} → ${right.get(pair.rightId) ?? pair.rightId}`,
    );
  }
  if (prompt.kind === 'sort' && key.kind === 'sort') {
    const items = new Map(prompt.items.map((option) => [option.id, option.label]));
    const categories = new Map(prompt.categories.map((option) => [option.id, option.label]));
    return key.placements.map(
      (item) =>
        `${items.get(item.itemId) ?? item.itemId} → ${categories.get(item.categoryId) ?? item.categoryId}`,
    );
  }
  if (prompt.kind === 'order' && key.kind === 'order') {
    const labels = new Map(prompt.items.map((option) => [option.id, option.label]));
    return key.itemIds.map((id) => labels.get(id) ?? id);
  }
  return [];
}

export function summarizeLiveResult(input: {
  code: string;
  lessonId: string;
  sceneId: string;
  sceneTitle: string;
  closedAt: number;
  prompts: PublicPrompt[];
  keys: Record<string, AnswerKey>;
  responses: StoredResponse[];
}): LiveResultRecord {
  const students: LiveResultStudent[] = [];
  const prompts = input.prompts.map((prompt) => {
    const key = input.keys[prompt.id];
    let correctCount = 0;
    let ungradedCount = 0;
    let responseCount = 0;
    const promptAnswers: StudentAnswer[] = [];
    for (const response of input.responses) {
      const answer = response.answers[prompt.id];
      if (!answer || !key) continue;
      promptAnswers.push(answer);
      responseCount += 1;
      const correct = gradeLiveAnswer(key, answer);
      const student: LiveResultStudent = {
        displayName: response.displayName,
        promptId: prompt.id,
        correct,
      };
      if (answer.kind === 'text') student.text = answer.text;
      students.push(student);
      if (correct === null) ungradedCount += 1;
      else if (correct) correctCount += 1;
    }
    return {
      id: prompt.id,
      prompt: prompt.prompt,
      responseCount,
      correctCount,
      ungradedCount,
      tally: tallyPrompt(prompt, promptAnswers),
    };
  });
  return {
    version: 1,
    code: input.code,
    lessonId: input.lessonId,
    sceneId: input.sceneId,
    sceneTitle: input.sceneTitle,
    closedAt: input.closedAt,
    responseCount: input.responses.length,
    prompts,
    students,
  };
}

export function parseStudentAnswer(value: unknown): StudentAnswer | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.kind === 'choice' && Array.isArray(record.optionIds)) {
    const optionIds = record.optionIds
      .filter((id): id is string => typeof id === 'string')
      .slice(0, 12);
    return { kind: 'choice', optionIds };
  }
  if (record.kind === 'true-false' && typeof record.value === 'boolean') {
    return { kind: 'true-false', value: record.value };
  }
  if (record.kind === 'match' && Array.isArray(record.pairs)) {
    const pairs = record.pairs
      .filter((pair): pair is { leftId: string; rightId: string } => {
        return (
          !!pair &&
          typeof pair === 'object' &&
          typeof (pair as { leftId?: unknown }).leftId === 'string' &&
          typeof (pair as { rightId?: unknown }).rightId === 'string'
        );
      })
      .slice(0, 30);
    return { kind: 'match', pairs };
  }
  if (record.kind === 'sort' && Array.isArray(record.placements)) {
    const placements = record.placements
      .filter((item): item is { itemId: string; categoryId: string } => {
        return (
          !!item &&
          typeof item === 'object' &&
          typeof (item as { itemId?: unknown }).itemId === 'string' &&
          typeof (item as { categoryId?: unknown }).categoryId === 'string'
        );
      })
      .slice(0, 30);
    return { kind: 'sort', placements };
  }
  if (record.kind === 'order' && Array.isArray(record.itemIds)) {
    const itemIds = record.itemIds
      .filter((id): id is string => typeof id === 'string')
      .slice(0, 30);
    return { kind: 'order', itemIds };
  }
  if (record.kind === 'text' && typeof record.text === 'string') {
    return { kind: 'text', text: record.text.trim().slice(0, 2000) };
  }
  return null;
}

export function sanitizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function gradeChoiceKey(correctOptionIds: string[], optionIds: string[]): boolean {
  const options = [...new Set([...correctOptionIds, ...optionIds])].map((value) => ({
    label: value,
    value,
  }));
  const [result] = gradeChoiceQuestions(
    [
      {
        id: 'live',
        type: correctOptionIds.length > 1 ? 'multiple' : 'single',
        question: 'live',
        options,
        answer: correctOptionIds,
      },
    ],
    { live: optionIds },
  );
  return result?.correct === true;
}

function isCollectedActivity(
  activity: NativeActivityDefinition,
): activity is Exclude<NativeActivityDefinition, { type: 'spin-wheel' | 'team-battle' }> {
  return activity.type !== 'spin-wheel' && activity.type !== 'team-battle';
}

function buildActivityPrompts(
  sceneId: string,
  activity: Exclude<NativeActivityDefinition, { type: 'spin-wheel' | 'team-battle' }>,
  random: () => number,
): LivePromptSet {
  const prompts: PublicPrompt[] = [];
  const keys: Record<string, AnswerKey> = {};
  const add = (prompt: PublicPrompt, key: AnswerKey) => {
    prompts.push(prompt);
    keys[prompt.id] = key;
  };
  if (activity.type === 'multiple-choice') {
    activity.questions.forEach((question, index) => {
      const id = promptId(sceneId, question.id || String(index));
      add(
        {
          kind: 'choice',
          id,
          prompt: question.prompt,
          multi: question.correctOptionIds.length > 1,
          options: question.options.map((option) => ({ id: option.id, label: option.label })),
        },
        { kind: 'choice', correctOptionIds: [...question.correctOptionIds] },
      );
    });
  } else if (activity.type === 'true-false') {
    activity.questions.forEach((question, index) => {
      const id = promptId(sceneId, question.id || String(index));
      add(
        { kind: 'true-false', id, prompt: question.prompt },
        { kind: 'true-false', answer: question.answer },
      );
    });
  } else if (activity.type === 'match-pairs') {
    const id = promptId(sceneId, activity.id);
    const pairs = activity.pairs.map((pair) => ({
      leftId: pair.id,
      rightId: `right_${opaqueId(random)}`,
      left: pair.left,
      right: pair.right,
    }));
    add(
      {
        kind: 'match',
        id,
        prompt: activity.instructions || activity.title,
        left: pairs.map((pair) => ({ id: pair.leftId, label: pair.left })),
        right: shuffle(
          pairs.map((pair) => ({ id: pair.rightId, label: pair.right })),
          random,
        ),
      },
      { kind: 'match', pairs: pairs.map(({ leftId, rightId }) => ({ leftId, rightId })) },
    );
  } else if (activity.type === 'sort') {
    const id = promptId(sceneId, activity.id);
    add(
      {
        kind: 'sort',
        id,
        prompt: activity.instructions || activity.title,
        categories: activity.categories.map((category) => ({
          id: category.id,
          label: category.label,
        })),
        items: shuffle(
          activity.items.map((item) => ({ id: item.id, label: item.label })),
          random,
        ),
      },
      {
        kind: 'sort',
        placements: activity.items.map((item) => ({
          itemId: item.id,
          categoryId: item.categoryId,
        })),
      },
    );
  } else if (activity.type === 'ordering') {
    const id = promptId(sceneId, activity.id);
    add(
      {
        kind: 'order',
        id,
        prompt: activity.instructions || activity.title,
        items: shuffle(
          activity.items.map((item) => ({ id: item.id, label: item.label })),
          random,
        ),
      },
      { kind: 'order', itemIds: [...activity.correctOrder] },
    );
  }
  assertPublicPrompts(prompts);
  return { prompts, keys };
}

function buildQuizPrompts(sceneId: string, questions: QuizQuestion[]): LivePromptSet {
  const prompts: PublicPrompt[] = [];
  const keys: Record<string, AnswerKey> = {};
  questions.forEach((question, index) => {
    const id = promptId(sceneId, question.id || String(index));
    if (question.type === 'short_answer') {
      prompts.push({ kind: 'text', id, prompt: question.question });
      keys[id] = { kind: 'text' };
      return;
    }
    const options = (question.options ?? [])
      .filter((option) => option.value && option.label)
      .map((option) => ({ id: option.value, label: option.label }));
    if (options.length < 2) return;
    prompts.push({
      kind: 'choice',
      id,
      prompt: question.question,
      multi: question.type === 'multiple',
      options,
    });
    keys[id] = { kind: 'choice', correctOptionIds: [...(question.answer ?? [])] };
  });
  assertPublicPrompts(prompts);
  return { prompts, keys };
}

function promptId(sceneId: string, questionId: string): string {
  return `${sceneId}:${questionId}`.slice(0, 160);
}

function opaqueId(random: () => number): string {
  return Math.floor(random() * 1_000_000_000)
    .toString(36)
    .padStart(4, '0');
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
