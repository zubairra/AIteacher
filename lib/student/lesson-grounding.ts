import type { GroundedLesson } from './types';

const MAX_EXCERPT = 12_000;
const MAX_DEPTH = 12;

const SKIP = new Set([
  'answer',
  'answers',
  'gradingKey',
  'path',
  'src',
  'fill',
  'image',
  'blob',
  'ciphertext',
  'apiKey',
  'authTag',
  'iv',
  'viewBox',
  'gradient',
  'shadow',
  'pattern',
  'defaultFontName',
  'defaultColor',
]);

const TEXT_KEYS = new Set([
  'title',
  'text',
  'content',
  'question',
  'analysis',
  'description',
  'name',
  'label',
  'teacherTip',
  'commonMisconception',
  'discussionPrompt',
  'explanationNote',
  'topic',
  'subject',
  'grade',
  'caption',
  'notes',
]);

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushText(bucket: string[], seen: Set<string>, value: string) {
  const plain = stripHtml(value);
  if (plain.length < 2 || plain.length > 2000) return;
  if (/^https?:\/\//i.test(plain)) return;
  if (/^#[0-9a-f]{3,8}$/i.test(plain)) return;
  if (seen.has(plain)) return;
  seen.add(plain);
  bucket.push(plain);
}

function walk(
  value: unknown,
  bucket: string[],
  seen: Set<string>,
  depth: number,
  allowText: boolean,
) {
  if (depth > MAX_DEPTH || bucket.join('\n').length >= MAX_EXCERPT) return;
  if (typeof value === 'string') {
    if (allowText) pushText(bucket, seen, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, bucket, seen, depth + 1, allowText);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SKIP.has(key)) continue;
    walk(child, bucket, seen, depth + 1, TEXT_KEYS.has(key));
  }
}

function stringField(record: Record<string, unknown> | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function groundLesson(input: {
  stage: Record<string, unknown> | null;
  scenes: unknown[];
}): GroundedLesson {
  const stage = input.stage ?? {};
  const teacherLesson =
    stage.teacherLesson && typeof stage.teacherLesson === 'object'
      ? (stage.teacherLesson as Record<string, unknown>)
      : undefined;
  const title = stringField(stage, 'name') || stringField(stage, 'title') || 'Untitled lesson';
  const subject = stringField(teacherLesson, 'subject');
  const grade = stringField(teacherLesson, 'grade');
  const topic = stringField(teacherLesson, 'topic') || title;
  const bucket: string[] = [];
  const seen = new Set<string>();
  walk(stage, bucket, seen, 0, false);
  for (const scene of input.scenes) walk(scene, bucket, seen, 0, false);
  const excerpt = bucket.join('\n').slice(0, MAX_EXCERPT);
  const available = excerpt.length > 0;
  return {
    title,
    subject,
    grade,
    topic,
    excerpt,
    available,
    gapNote: available
      ? ''
      : 'The lesson record has no extractable content. Say so. Do not invent the lesson.',
  };
}

export function sceneTitles(scenes: unknown[]): string[] {
  const titles: string[] = [];
  for (const scene of scenes) {
    if (!scene || typeof scene !== 'object') continue;
    const title = (scene as { title?: unknown }).title;
    if (typeof title === 'string' && title.trim()) titles.push(title.trim().slice(0, 160));
    if (titles.length >= 40) break;
  }
  return titles;
}
