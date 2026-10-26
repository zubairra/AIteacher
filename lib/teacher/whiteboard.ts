import {
  eraseAnnotationStrokes,
  type AnnotationPoint,
  type AnnotationStroke,
} from '@/lib/teacher/annotations';

export const WHITEBOARD_STANDALONE_ID = 'standalone';
/** Stay under Firestore's 1 MB document limit with room for indexes and overhead. */
export const MAX_WHITEBOARD_PAGE_BYTES = 800_000;
const QUANT = 10_000;
const HISTORY_LIMIT = 40;
const MARK_KINDS = ['freehand', 'line', 'rect', 'ellipse', 'arrow', 'text'] as const;

export type WhiteboardMarkKind = (typeof MARK_KINDS)[number];

export interface WhiteboardMark {
  readonly id: string;
  readonly kind: WhiteboardMarkKind;
  readonly color: string;
  readonly width: number;
  readonly points: readonly AnnotationPoint[];
  readonly text?: string;
}

export interface WhiteboardPage {
  readonly id: string;
  readonly marks: readonly WhiteboardMark[];
}

export interface WhiteboardState {
  readonly pages: readonly WhiteboardPage[];
  readonly activePageId: string;
  readonly past: Readonly<Record<string, readonly (readonly WhiteboardMark[])[]>>;
  readonly future: Readonly<Record<string, readonly (readonly WhiteboardMark[])[]>>;
}

export interface EncodedWhiteboardMark {
  readonly id: string;
  readonly kind: WhiteboardMarkKind;
  readonly color: string;
  readonly width: number;
  readonly points: readonly number[];
  readonly text?: string;
}

export interface EncodedWhiteboardPage {
  readonly version: 1;
  readonly ownerUid: string;
  readonly marks: readonly EncodedWhiteboardMark[];
}

export interface EncodedWhiteboardBoard {
  readonly version: 1;
  readonly ownerUid: string;
  readonly lessonId: string | null;
  readonly pageOrder: readonly string[];
  readonly activePageId: string;
  readonly updatedAt: number;
}

export function createWhiteboardState(pageId = 'page-1'): WhiteboardState {
  return {
    pages: [{ id: pageId, marks: [] }],
    activePageId: pageId,
    past: {},
    future: {},
  };
}

export function activeWhiteboardPage(state: WhiteboardState): WhiteboardPage {
  return state.pages.find((page) => page.id === state.activePageId) ?? state.pages[0];
}

export function addWhiteboardPage(state: WhiteboardState, pageId: string): WhiteboardState {
  if (state.pages.some((page) => page.id === pageId)) {
    return { ...state, activePageId: pageId };
  }
  return {
    ...state,
    pages: [...state.pages, { id: pageId, marks: [] }],
    activePageId: pageId,
  };
}

export function selectWhiteboardPage(state: WhiteboardState, pageId: string): WhiteboardState {
  if (!state.pages.some((page) => page.id === pageId)) return state;
  return state.activePageId === pageId ? state : { ...state, activePageId: pageId };
}

export function commitPageMarks(
  state: WhiteboardState,
  pageId: string,
  marks: readonly WhiteboardMark[],
): { state: WhiteboardState; rejected: boolean } {
  const current = state.pages.find((page) => page.id === pageId);
  if (!current) return { state, rejected: false };
  if (encodedPageBytes({ id: pageId, marks }) > MAX_WHITEBOARD_PAGE_BYTES) {
    return { state, rejected: true };
  }
  if (current.marks === marks) return { state, rejected: false };
  const past = [...(state.past[pageId] ?? []), current.marks].slice(-HISTORY_LIMIT);
  const future = { ...state.future };
  delete future[pageId];
  return {
    rejected: false,
    state: {
      ...state,
      pages: state.pages.map((page) => (page.id === pageId ? { id: pageId, marks } : page)),
      past: { ...state.past, [pageId]: past },
      future,
    },
  };
}

export function undoWhiteboard(state: WhiteboardState): WhiteboardState {
  const pageId = state.activePageId;
  const past = state.past[pageId] ?? [];
  const previous = past.at(-1);
  if (!previous) return state;
  const current = activeWhiteboardPage(state).marks;
  return {
    ...state,
    pages: state.pages.map((page) => (page.id === pageId ? { ...page, marks: previous } : page)),
    past: { ...state.past, [pageId]: past.slice(0, -1) },
    future: { ...state.future, [pageId]: [current, ...(state.future[pageId] ?? [])] },
  };
}

export function redoWhiteboard(state: WhiteboardState): WhiteboardState {
  const pageId = state.activePageId;
  const future = state.future[pageId] ?? [];
  const next = future[0];
  if (!next) return state;
  const current = activeWhiteboardPage(state).marks;
  return {
    ...state,
    pages: state.pages.map((page) => (page.id === pageId ? { ...page, marks: next } : page)),
    past: {
      ...state.past,
      [pageId]: [...(state.past[pageId] ?? []), current].slice(-HISTORY_LIMIT),
    },
    future: { ...state.future, [pageId]: future.slice(1) },
  };
}

export function clearWhiteboardPage(state: WhiteboardState): WhiteboardState {
  const page = activeWhiteboardPage(state);
  if (page.marks.length === 0) return state;
  return commitPageMarks(state, page.id, []).state;
}

/** Drop samples on a very long stroke so one gesture cannot fill the page document. */
export function limitFreehandPoints(
  points: readonly AnnotationPoint[],
  max = 2400,
): readonly AnnotationPoint[] {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  const sampled = points.filter((_, index) => index % stride === 0);
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

export function markHits(mark: WhiteboardMark, point: AnnotationPoint, radius: number): boolean {
  if (mark.kind === 'text') {
    const anchor = mark.points[0];
    if (!anchor) return false;
    return Math.hypot(anchor.x - point.x, anchor.y - point.y) <= radius + 0.04;
  }
  if (mark.kind === 'rect' || mark.kind === 'ellipse') {
    const [start, end] = mark.points;
    if (!start || !end) return false;
    const left = Math.min(start.x, end.x) - radius;
    const right = Math.max(start.x, end.x) + radius;
    const top = Math.min(start.y, end.y) - radius;
    const bottom = Math.max(start.y, end.y) + radius;
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  }
  const stroke: AnnotationStroke = {
    id: mark.id,
    color: mark.color,
    width: mark.width,
    points: mark.points,
  };
  return eraseAnnotationStrokes([stroke], point, radius).length === 0;
}

export function encodePage(ownerUid: string, page: WhiteboardPage): EncodedWhiteboardPage {
  return {
    version: 1,
    ownerUid,
    marks: page.marks.map((mark) => ({
      id: mark.id.slice(0, 80),
      kind: mark.kind,
      color: mark.color.slice(0, 32),
      width: quantize(mark.width),
      ...(mark.text ? { text: mark.text.slice(0, 200) } : {}),
      points: mark.points.flatMap((point) => [quantize(point.x), quantize(point.y)]),
    })),
  };
}

export function encodedPageBytes(page: WhiteboardPage, ownerUid = 'size-check'): number {
  return new TextEncoder().encode(JSON.stringify(encodePage(ownerUid, page))).length;
}

export function encodeBoard(
  ownerUid: string,
  lessonId: string | null,
  state: WhiteboardState,
  updatedAt = Date.now(),
): EncodedWhiteboardBoard {
  return {
    version: 1,
    ownerUid,
    lessonId,
    pageOrder: state.pages.map((page) => page.id),
    activePageId: state.activePageId,
    updatedAt,
  };
}

export function decodeWhiteboard(
  board: unknown,
  pages: ReadonlyMap<string, unknown>,
): WhiteboardState | null {
  if (!board || typeof board !== 'object') return null;
  const record = board as Partial<EncodedWhiteboardBoard>;
  const pageOrder = Array.isArray(record.pageOrder)
    ? record.pageOrder.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (pageOrder.length === 0) return null;
  const decodedPages = pageOrder.map((id) => ({
    id,
    marks: decodeMarks(pages.get(id)),
  }));
  const activePageId = pageOrder.includes(String(record.activePageId))
    ? String(record.activePageId)
    : pageOrder[0];
  return {
    pages: decodedPages,
    activePageId,
    past: {},
    future: {},
  };
}

function decodeMarks(value: unknown): WhiteboardMark[] {
  if (!value || typeof value !== 'object') return [];
  const marks = (value as { marks?: unknown }).marks;
  if (!Array.isArray(marks)) return [];
  const decoded: WhiteboardMark[] = [];
  for (const mark of marks) {
    if (!mark || typeof mark !== 'object') continue;
    const record = mark as Partial<EncodedWhiteboardMark>;
    if (typeof record.id !== 'string' || !isMarkKind(record.kind)) continue;
    if (typeof record.color !== 'string' || typeof record.width !== 'number') continue;
    if (!Array.isArray(record.points)) continue;
    const points: AnnotationPoint[] = [];
    for (let index = 0; index + 1 < record.points.length; index += 2) {
      const x = record.points[index];
      const y = record.points[index + 1];
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      points.push({ x: x / QUANT, y: y / QUANT, pressure: 0.5 });
    }
    if (record.kind !== 'text' && points.length === 0) continue;
    decoded.push({
      id: record.id,
      kind: record.kind,
      color: record.color,
      width: record.width / QUANT,
      points,
      ...(typeof record.text === 'string' && record.text ? { text: record.text } : {}),
    });
  }
  return decoded;
}

function isMarkKind(value: unknown): value is WhiteboardMarkKind {
  return typeof value === 'string' && (MARK_KINDS as readonly string[]).includes(value);
}

function quantize(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(QUANT, Math.round(value * QUANT)));
}
