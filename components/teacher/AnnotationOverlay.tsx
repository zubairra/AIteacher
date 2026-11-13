'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  addAnnotationStroke,
  commitSceneStrokes,
  eraseAnnotationStrokes,
  getSceneAnnotationHistory,
  normalizedDistanceForPixels,
  normalizedPointFromClient,
  type AnnotationPoint,
  type AnnotationStroke,
  type AnnotationTool,
  type TeacherAnnotationState,
} from '@/lib/teacher/annotations';
import { drawAnnotationStroke } from '@/lib/teacher/annotation-draw';
import { cn } from '@/lib/utils';

const PEN_WIDTH_PX = 5;
const ERASER_RADIUS_PX = 22;

interface AnnotationOverlayProps {
  readonly sceneId: string;
  readonly tool: AnnotationTool;
  readonly state: TeacherAnnotationState;
  readonly onStateChange: (state: TeacherAnnotationState) => void;
}

export function AnnotationOverlay({ sceneId, tool, state, onStateChange }: AnnotationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<AnnotationStroke | null>(null);
  const erasedStrokesRef = useRef<readonly AnnotationStroke[] | null>(null);
  const frameRef = useRef(0);
  const strokes = getSceneAnnotationHistory(state, sceneId).strokes;
  const strokesRef = useRef(strokes);

  const draw = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    const visibleStrokes = erasedStrokesRef.current ?? strokesRef.current;
    for (const stroke of activeStrokeRef.current
      ? [...visibleStrokes, activeStrokeRef.current]
      : visibleStrokes) {
      drawAnnotationStroke(context, stroke, rect.width, rect.height);
    }
  }, []);

  const scheduleDraw = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(canvas);
    scheduleDraw();
    return () => observer.disconnect();
  }, [scheduleDraw]);

  useEffect(() => {
    strokesRef.current = strokes;
    scheduleDraw();
  }, [sceneId, scheduleDraw, strokes]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const pointsForEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const source = coalesced.length > 0 ? coalesced : [event.nativeEvent];
    return source.map((sample) =>
      normalizedPointFromClient(sample.clientX, sample.clientY, rect, sample.pressure),
    );
  };

  const eraseAtPoints = (
    source: readonly AnnotationStroke[],
    points: readonly AnnotationPoint[],
    rect: DOMRect,
  ) => {
    const radius = normalizedDistanceForPixels(ERASER_RADIUS_PX, rect);
    return points.reduce(
      (remaining, point) => eraseAnnotationStrokes(remaining, point, radius),
      source,
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'off' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const points = pointsForEvent(event);
    if (tool === 'pen') {
      activeStrokeRef.current = {
        id: crypto.randomUUID(),
        points,
        color: '#ef4444',
        width: normalizedDistanceForPixels(PEN_WIDTH_PX, rect),
      };
    } else {
      erasedStrokesRef.current = eraseAtPoints(strokesRef.current, points, rect);
    }
    scheduleDraw();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    const points = pointsForEvent(event);
    if (tool === 'pen' && activeStrokeRef.current) {
      activeStrokeRef.current = {
        ...activeStrokeRef.current,
        points: [...activeStrokeRef.current.points, ...points],
      };
    } else if (tool === 'eraser' && erasedStrokesRef.current) {
      erasedStrokesRef.current = eraseAtPoints(
        erasedStrokesRef.current,
        points,
        event.currentTarget.getBoundingClientRect(),
      );
    }
    scheduleDraw();
  };

  const finishGesture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (activeStrokeRef.current) {
      onStateChange(addAnnotationStroke(state, sceneId, activeStrokeRef.current));
    } else if (erasedStrokesRef.current && erasedStrokesRef.current !== strokesRef.current) {
      onStateChange(commitSceneStrokes(state, sceneId, erasedStrokesRef.current));
    }
    activeStrokeRef.current = null;
    erasedStrokesRef.current = null;
    scheduleDraw();
  };

  return (
    <canvas
      ref={canvasRef}
      data-testid="teacher-annotation-overlay"
      className={cn(
        'absolute inset-0 z-30 h-full w-full select-none',
        tool === 'off' ? 'pointer-events-none' : 'touch-none pointer-events-auto',
        tool === 'pen' && 'cursor-crosshair',
        tool === 'eraser' && 'cursor-cell',
      )}
      aria-hidden="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={finishGesture}
    />
  );
}
