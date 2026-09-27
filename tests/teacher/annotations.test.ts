import { describe, expect, it } from 'vitest';
import {
  addAnnotationStroke,
  clearSceneAnnotations,
  createTeacherAnnotationState,
  eraseAnnotationStrokes,
  getSceneAnnotationHistory,
  normalizedPointFromClient,
  redoSceneAnnotations,
  undoSceneAnnotations,
  type AnnotationStroke,
} from '@/lib/teacher/annotations';

const stroke: AnnotationStroke = {
  id: 'stroke-1',
  color: '#ef4444',
  width: 0.01,
  points: [
    { x: 0.1, y: 0.2, pressure: 0.5 },
    { x: 0.8, y: 0.7, pressure: 0.5 },
  ],
};

describe('teacher annotation engine', () => {
  it('normalizes and clamps pointer coordinates independently of resolution', () => {
    const small = normalizedPointFromClient(960, 540, {
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
    });
    const large = normalizedPointFromClient(1920, 1080, {
      left: 0,
      top: 0,
      width: 3840,
      height: 2160,
    });
    expect(small).toMatchObject({ x: 0.5, y: 0.5 });
    expect(large).toMatchObject({ x: 0.5, y: 0.5 });
    expect(
      normalizedPointFromClient(-20, 1200, { left: 0, top: 0, width: 100, height: 100 }),
    ).toMatchObject({
      x: 0,
      y: 1,
    });
  });

  it('creates scene-specific stroke state', () => {
    const state = addAnnotationStroke(createTeacherAnnotationState(), 'scene-a', stroke);
    expect(getSceneAnnotationHistory(state, 'scene-a').strokes).toEqual([stroke]);
    expect(getSceneAnnotationHistory(state, 'scene-b').strokes).toEqual([]);
  });

  it('erases stroke data rather than painting over lesson content', () => {
    expect(eraseAnnotationStrokes([stroke], { x: 0.45, y: 0.45, pressure: 0.5 }, 0.05)).toEqual([]);
    expect(eraseAnnotationStrokes([stroke], { x: 0.95, y: 0.05, pressure: 0.5 }, 0.02)).toEqual([
      stroke,
    ]);
  });

  it('supports undo, redo, and clear without crossing scene boundaries', () => {
    const added = addAnnotationStroke(createTeacherAnnotationState(), 'scene-a', stroke);
    const undone = undoSceneAnnotations(added, 'scene-a');
    expect(getSceneAnnotationHistory(undone, 'scene-a').strokes).toEqual([]);
    expect(getSceneAnnotationHistory(undone, 'scene-a').future).toHaveLength(1);

    const redone = redoSceneAnnotations(undone, 'scene-a');
    expect(getSceneAnnotationHistory(redone, 'scene-a').strokes).toEqual([stroke]);

    const cleared = clearSceneAnnotations(redone, 'scene-a');
    expect(getSceneAnnotationHistory(cleared, 'scene-a').strokes).toEqual([]);
    expect(getSceneAnnotationHistory(cleared, 'scene-a').past).toHaveLength(2);
    expect(getSceneAnnotationHistory(cleared, 'scene-b').strokes).toEqual([]);
  });
});
