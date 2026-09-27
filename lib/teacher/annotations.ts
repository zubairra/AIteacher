export type AnnotationTool = 'off' | 'pen' | 'eraser';

export interface AnnotationPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export interface AnnotationStroke {
  readonly id: string;
  readonly points: readonly AnnotationPoint[];
  readonly color: string;
  /** Width relative to the shortest side of the annotated surface. */
  readonly width: number;
}

export interface SceneAnnotationHistory {
  readonly strokes: readonly AnnotationStroke[];
  readonly past: readonly (readonly AnnotationStroke[])[];
  readonly future: readonly (readonly AnnotationStroke[])[];
}

export interface TeacherAnnotationState {
  readonly scenes: Readonly<Record<string, SceneAnnotationHistory>>;
}

const EMPTY_HISTORY: SceneAnnotationHistory = { strokes: [], past: [], future: [] };
const HISTORY_LIMIT = 50;

export function createTeacherAnnotationState(): TeacherAnnotationState {
  return { scenes: {} };
}

export function getSceneAnnotationHistory(
  state: TeacherAnnotationState,
  sceneId: string,
): SceneAnnotationHistory {
  return state.scenes[sceneId] ?? EMPTY_HISTORY;
}

function updateScene(
  state: TeacherAnnotationState,
  sceneId: string,
  history: SceneAnnotationHistory,
): TeacherAnnotationState {
  return { scenes: { ...state.scenes, [sceneId]: history } };
}

export function commitSceneStrokes(
  state: TeacherAnnotationState,
  sceneId: string,
  strokes: readonly AnnotationStroke[],
): TeacherAnnotationState {
  const current = getSceneAnnotationHistory(state, sceneId);
  if (current.strokes === strokes) return state;
  return updateScene(state, sceneId, {
    strokes,
    past: [...current.past, current.strokes].slice(-HISTORY_LIMIT),
    future: [],
  });
}

export function addAnnotationStroke(
  state: TeacherAnnotationState,
  sceneId: string,
  stroke: AnnotationStroke,
): TeacherAnnotationState {
  const current = getSceneAnnotationHistory(state, sceneId);
  return commitSceneStrokes(state, sceneId, [...current.strokes, stroke]);
}

export function clearSceneAnnotations(
  state: TeacherAnnotationState,
  sceneId: string,
): TeacherAnnotationState {
  const current = getSceneAnnotationHistory(state, sceneId);
  return current.strokes.length === 0 ? state : commitSceneStrokes(state, sceneId, []);
}

export function undoSceneAnnotations(
  state: TeacherAnnotationState,
  sceneId: string,
): TeacherAnnotationState {
  const current = getSceneAnnotationHistory(state, sceneId);
  const previous = current.past.at(-1);
  if (!previous) return state;
  return updateScene(state, sceneId, {
    strokes: previous,
    past: current.past.slice(0, -1),
    future: [current.strokes, ...current.future],
  });
}

export function redoSceneAnnotations(
  state: TeacherAnnotationState,
  sceneId: string,
): TeacherAnnotationState {
  const next = currentFuture(state, sceneId);
  if (!next) return state;
  const current = getSceneAnnotationHistory(state, sceneId);
  return updateScene(state, sceneId, {
    strokes: next,
    past: [...current.past, current.strokes].slice(-HISTORY_LIMIT),
    future: current.future.slice(1),
  });
}

function currentFuture(
  state: TeacherAnnotationState,
  sceneId: string,
): readonly AnnotationStroke[] | undefined {
  return getSceneAnnotationHistory(state, sceneId).future[0];
}

export function normalizedPointFromClient(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  pressure = 0.5,
): AnnotationPoint {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  return {
    x: clamp((clientX - rect.left) / width),
    y: clamp((clientY - rect.top) / height),
    pressure: clamp(pressure || 0.5),
  };
}

export function normalizedDistanceForPixels(
  pixels: number,
  rect: Pick<DOMRect, 'width' | 'height'>,
): number {
  return pixels / Math.max(1, Math.min(rect.width, rect.height));
}

export function eraseAnnotationStrokes(
  strokes: readonly AnnotationStroke[],
  point: AnnotationPoint,
  radius: number,
): readonly AnnotationStroke[] {
  const remaining = strokes.filter((stroke) => !strokeTouchesPoint(stroke, point, radius));
  return remaining.length === strokes.length ? strokes : remaining;
}

function strokeTouchesPoint(
  stroke: AnnotationStroke,
  point: AnnotationPoint,
  radius: number,
): boolean {
  if (stroke.points.length === 0) return false;
  const threshold = radius + stroke.width / 2;
  if (stroke.points.length === 1) return pointDistance(stroke.points[0], point) <= threshold;
  for (let index = 1; index < stroke.points.length; index += 1) {
    if (distanceToSegment(point, stroke.points[index - 1], stroke.points[index]) <= threshold) {
      return true;
    }
  }
  return false;
}

function distanceToSegment(point: AnnotationPoint, start: AnnotationPoint, end: AnnotationPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return pointDistance(point, start);
  const projection = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
  );
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

function pointDistance(left: AnnotationPoint, right: AnnotationPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
