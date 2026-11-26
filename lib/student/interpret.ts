import type { GradingKey, PublicActivity, PublicActivityItem, TutorMode } from './types';
import { oneLine } from './untrusted';

const FOLLOWUPS = '<<<FOLLOWUPS>>>';

export function visibleStreamText(raw: string): string {
  const index = raw.indexOf(FOLLOWUPS);
  return (index >= 0 ? raw.slice(0, index) : raw).trimEnd();
}

function safeId(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value : fallback;
  return /^[A-Za-z0-9_-]{1,16}$/.test(text) ? text : fallback;
}

function strings(value: unknown, max: number, length: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = oneLine(item, length);
    if (!text) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

export function extractJsonValue(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const objectStart = source.indexOf('{');
  const arrayStart = source.indexOf('[');
  const useArray = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart);
  const start = useArray ? arrayStart : objectStart;
  const end = useArray ? source.lastIndexOf(']') : source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

export function extractJsonObject(text: string): unknown | null {
  const value = extractJsonValue(text);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function enforceStepMode(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*final answer\s*:/i.test(line)) {
      kept.push('I am holding the final result. Tell me what you would try next.');
      break;
    }
    kept.push(line);
  }
  return kept.join('\n').trim();
}

function scrub(text: string, secrets: string[]): string {
  let next = text;
  for (const secret of secrets) {
    if (secret.trim().length < 4) continue;
    next = next.split(secret).join('…');
  }
  return next;
}

interface ParsedItem {
  item: PublicActivityItem;
  accept: string[];
  explanation: string;
}

function parseItems(value: unknown, limit: number): ParsedItem[] {
  if (!value || typeof value !== 'object') return [];
  const activity = value as { items?: unknown; kind?: unknown };
  if (!Array.isArray(activity.items)) return [];
  const items: ParsedItem[] = [];
  for (const raw of activity.items) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const id = safeId(record.id, `q${items.length + 1}`);
    const prompt = typeof record.prompt === 'string' ? oneLine(record.prompt, 500) : '';
    const front = typeof record.front === 'string' ? oneLine(record.front, 300) : '';
    const back = typeof record.back === 'string' ? oneLine(record.back, 300) : '';
    const options = Array.isArray(record.options)
      ? record.options.slice(0, 6).flatMap((option, index) => {
          if (!option || typeof option !== 'object') return [];
          const row = option as { id?: unknown; text?: unknown };
          const text = typeof row.text === 'string' ? oneLine(row.text, 240) : '';
          if (!text) return [];
          return [{ id: safeId(row.id, String.fromCharCode(65 + index)), text }];
        })
      : undefined;
    if (!prompt && !front) continue;
    items.push({
      item: {
        id,
        prompt: prompt || front,
        ...(options && options.length > 0 ? { options } : {}),
        ...(front ? { front } : {}),
        ...(back ? { back } : {}),
      },
      accept: strings(record.accept, 6, 200),
      explanation: typeof record.explanation === 'string' ? oneLine(record.explanation, 400) : '',
    });
    if (items.length >= limit) break;
  }
  return items;
}

function activityFrom(
  items: ParsedItem[],
  kind: PublicActivity['kind'],
): {
  activity: PublicActivity;
  gradingKey: GradingKey;
  secrets: string[];
} {
  const gradingKey: GradingKey = { items: {} };
  const secrets: string[] = [];
  for (const item of items) {
    gradingKey.items[item.item.id] = { accept: item.accept, explanation: item.explanation };
    secrets.push(...item.accept);
  }
  return {
    activity: { kind, items: items.map((item) => item.item) },
    gradingKey,
    secrets,
  };
}

export interface InterpretedTutorOutput {
  ok: true;
  text: string;
  followUps: string[];
  concepts: string[];
  activity?: PublicActivity;
  gradingKey?: GradingKey;
}

export interface RejectedTutorOutput {
  ok: false;
  reason: 'empty' | 'malformed-exam';
}

function defaultFollowUps(mode: TutorMode, topic: string): string[] {
  if (mode === 'step') return ['What should I try next?', 'Can I have a hint without the answer?'];
  if (mode === 'exam') return [];
  return [`Can you give another example of ${topic}?`, `What is a common mistake about ${topic}?`];
}

function fallbackQuestion(topic: string, id: string): ParsedItem {
  return {
    item: {
      id,
      prompt: `In your own words, what is one important idea in ${topic}?`,
    },
    accept: [],
    explanation: '',
  };
}

function followUpsFrom(value: unknown, mode: TutorMode, topic: string): string[] {
  const parsed = strings(value, 3, 120);
  return parsed.length > 0 ? parsed : defaultFollowUps(mode, topic);
}

function conceptsFrom(value: unknown): string[] {
  return strings(value, 6, 40).filter((concept) => !/ignore|system prompt|api key/i.test(concept));
}

/**
 * Turn raw model text into a student-visible reply.
 * Explain and Step stay prose. Practice, Revision, and Exam become activities.
 * Exam mode refuses to invent questions when the model reply is unusable.
 * Practice and Revision can fall back to an unscored prompt grounded in the topic.
 */
export function interpretTutorOutput(
  mode: TutorMode,
  raw: string,
  topic: string,
): InterpretedTutorOutput | RejectedTutorOutput {
  const safeTopic = oneLine(topic, 80) || 'this lesson';
  if (mode === 'explain' || mode === 'step') {
    const followIndex = raw.indexOf(FOLLOWUPS);
    const visible = visibleStreamText(raw);
    const body = mode === 'step' ? enforceStepMode(visible) : visible.trim();
    let followUps = defaultFollowUps(mode, safeTopic);
    if (followIndex >= 0) {
      const parsed = extractJsonValue(raw.slice(followIndex));
      if (Array.isArray(parsed)) followUps = strings(parsed, 3, 120);
    }
    if (!body.trim()) return { ok: false, reason: 'empty' };
    return {
      ok: true,
      text: body.trim(),
      followUps: followUps.length > 0 ? followUps : defaultFollowUps(mode, safeTopic),
      concepts: [],
    };
  }

  const parsed = extractJsonObject(raw);
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  const kind: PublicActivity['kind'] =
    record?.activity &&
    typeof record.activity === 'object' &&
    (record.activity as { kind?: unknown }).kind === 'flashcards'
      ? 'flashcards'
      : record?.activity &&
          typeof record.activity === 'object' &&
          (record.activity as { kind?: unknown }).kind === 'short'
        ? 'short'
        : 'mcq';
  const limit = mode === 'practice' ? 1 : mode === 'revision' ? 2 : 3;
  let items = parseItems(record?.activity, limit);
  if (mode === 'exam' && items.length === 0) return { ok: false, reason: 'malformed-exam' };
  if (items.length === 0) {
    items = [fallbackQuestion(safeTopic, 'q1')];
    if (mode === 'revision') items.push(fallbackQuestion(safeTopic, 'q2'));
  }
  const built = activityFrom(items, items[0]?.item.front ? 'flashcards' : kind);
  const hideAnswers = mode === 'practice' || mode === 'exam';
  const prose =
    typeof record?.prose === 'string' && record.prose.trim()
      ? record.prose.trim().slice(0, 8000)
      : mode === 'revision'
        ? ''
        : `Try this question on ${safeTopic}.`;
  const text = hideAnswers ? scrub(prose, built.secrets) : prose;
  const activity: PublicActivity = {
    kind: built.activity.kind,
    items: built.activity.items.map((item) => ({
      ...item,
      prompt: hideAnswers ? scrub(item.prompt, built.secrets) : item.prompt,
      ...(item.options
        ? {
            options: item.options.map((option) => ({
              ...option,
              text: hideAnswers ? scrub(option.text, built.secrets) : option.text,
            })),
          }
        : {}),
    })),
  };
  const summary =
    mode === 'revision' && !text
      ? `Here is a revision check on ${safeTopic}. Use your lesson notes if you need a reminder.`
      : text;
  return {
    ok: true,
    text: summary,
    followUps: followUpsFrom(record?.followUps, mode, safeTopic),
    concepts: conceptsFrom(record?.concepts),
    activity,
    gradingKey: built.gradingKey,
  };
}
