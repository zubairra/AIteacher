'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Circle,
  Eraser,
  Minus,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { drawAnnotationStroke } from '@/lib/teacher/annotation-draw';
import {
  normalizedDistanceForPixels,
  normalizedPointFromClient,
  type AnnotationPoint,
} from '@/lib/teacher/annotations';
import {
  activeWhiteboardPage,
  addWhiteboardPage,
  clearWhiteboardPage,
  commitPageMarks,
  createWhiteboardState,
  limitFreehandPoints,
  markHits,
  redoWhiteboard,
  selectWhiteboardPage,
  undoWhiteboard,
  type WhiteboardMark,
  type WhiteboardMarkKind,
  type WhiteboardState,
} from '@/lib/teacher/whiteboard';
import { loadTeacherWhiteboard, saveTeacherWhiteboard } from '@/lib/teacher/whiteboard-store';
import { cn } from '@/lib/utils';

const COLORS = ['#0f172a', '#dc2626', '#2563eb', '#15803d', '#ea580c'] as const;
const WIDTHS = [
  { id: 'thin', label: 'Thin pen', px: 3 },
  { id: 'medium', label: 'Medium pen', px: 7 },
  { id: 'thick', label: 'Thick pen', px: 16 },
] as const;
const ERASER_RADIUS_PX = 28;

type DrawTool = 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'arrow' | 'text';

const TOOLS: Array<{ id: DrawTool; label: string; kind: WhiteboardMarkKind }> = [
  { id: 'pen', label: 'Pen', kind: 'freehand' },
  { id: 'line', label: 'Line', kind: 'line' },
  { id: 'rect', label: 'Rectangle', kind: 'rect' },
  { id: 'ellipse', label: 'Circle', kind: 'ellipse' },
  { id: 'arrow', label: 'Arrow', kind: 'arrow' },
  { id: 'text', label: 'Text', kind: 'text' },
  { id: 'eraser', label: 'Eraser', kind: 'freehand' },
];

export function TeacherWhiteboard({
  boardId,
  lessonId,
  onClose,
}: {
  readonly boardId: string;
  readonly lessonId: string | null;
  readonly onClose?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const stateRef = useRef<WhiteboardState>(createWhiteboardState());
  const draftRef = useRef<readonly WhiteboardMark[] | null>(null);
  const activeMarkRef = useRef<WhiteboardMark | null>(null);
  const dirtyPagesRef = useRef(new Set<string>());
  const editedRef = useRef(false);
  const [state, setState] = useState<WhiteboardState>(createWhiteboardState);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState<(typeof COLORS)[number]>(COLORS[0]);
  const [widthPx, setWidthPx] = useState<number>(WIDTHS[1].px);
  const [status, setStatus] = useState('Loading board');
  const [ready, setReady] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [textDraft, setTextDraft] = useState<{ point: AnnotationPoint; value: string } | null>(
    null,
  );
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const widthRef = useRef(widthPx);
  useEffect(() => {
    toolRef.current = tool;
    colorRef.current = color;
    widthRef.current = widthPx;
    stateRef.current = state;
  }, [color, state, tool, widthPx]);

  const applyState = useCallback((next: WhiteboardState, dirtyPageId?: string) => {
    if (dirtyPageId) {
      dirtyPagesRef.current.add(dirtyPageId);
      editedRef.current = true;
      setStatus('Saving…');
    }
    stateRef.current = next;
    setState(next);
  }, []);

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
    const page = activeWhiteboardPage(stateRef.current);
    const marks = draftRef.current ?? page.marks;
    const visible = activeMarkRef.current ? [...marks, activeMarkRef.current] : marks;
    for (const mark of visible) drawMark(context, mark, rect.width, rect.height);
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
    return () => {
      observer.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [scheduleDraw]);

  useEffect(() => {
    scheduleDraw();
  }, [scheduleDraw, state]);

  useEffect(() => {
    let cancelled = false;
    void loadTeacherWhiteboard(boardId)
      .then((loaded) => {
        if (cancelled || !loaded || editedRef.current) return;
        stateRef.current = loaded;
        setState(loaded);
        dirtyPagesRef.current.clear();
      })
      .catch(() => {
        if (!cancelled)
          setStatus('Could not load the saved board. New marks stay in this session.');
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
          setStatus((current) => (current === 'Loading board' ? 'Ready' : current));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  useEffect(() => {
    if (!ready || dirtyPagesRef.current.size === 0) return;
    const pageIds = [...dirtyPagesRef.current];
    const snapshot = state;
    const timer = window.setTimeout(() => {
      void saveTeacherWhiteboard({
        boardId,
        lessonId,
        state: snapshot,
        pageIds,
      })
        .then(() => {
          for (const pageId of pageIds) dirtyPagesRef.current.delete(pageId);
          setStatus(dirtyPagesRef.current.size === 0 ? 'Saved' : 'Saving…');
        })
        .catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : 'Could not save the board.');
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [boardId, lessonId, ready, state]);

  const commitDraft = (marks: readonly WhiteboardMark[]) => {
    const pageId = activeWhiteboardPage(stateRef.current).id;
    const result = commitPageMarks(stateRef.current, pageId, marks);
    if (result.rejected) {
      setStatus('This page is full. Add a new page.');
      return;
    }
    applyState(result.state, pageId);
  };

  const pointsForEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const source = coalesced.length > 0 ? coalesced : [event.nativeEvent];
    return source.map((sample) =>
      normalizedPointFromClient(sample.clientX, sample.clientY, rect, sample.pressure),
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (textDraft) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const points = pointsForEvent(event);
    const page = activeWhiteboardPage(stateRef.current);
    if (toolRef.current === 'eraser') {
      const radius = normalizedDistanceForPixels(ERASER_RADIUS_PX, rect);
      draftRef.current = page.marks.filter(
        (mark) => !points.some((point) => markHits(mark, point, radius)),
      );
      scheduleDraw();
      return;
    }
    if (toolRef.current === 'text') {
      setTextDraft({ point: points[0], value: '' });
      return;
    }
    const kind = TOOLS.find((item) => item.id === toolRef.current)?.kind ?? 'freehand';
    activeMarkRef.current = {
      id: crypto.randomUUID(),
      kind,
      color: colorRef.current,
      width: normalizedDistanceForPixels(widthRef.current, rect),
      points,
    };
    scheduleDraw();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    const points = pointsForEvent(event);
    if (toolRef.current === 'eraser' && draftRef.current) {
      const radius = normalizedDistanceForPixels(
        ERASER_RADIUS_PX,
        event.currentTarget.getBoundingClientRect(),
      );
      draftRef.current = draftRef.current.filter(
        (mark) => !points.some((point) => markHits(mark, point, radius)),
      );
    } else if (activeMarkRef.current?.kind === 'freehand') {
      activeMarkRef.current = {
        ...activeMarkRef.current,
        points: limitFreehandPoints([...activeMarkRef.current.points, ...points]),
      };
    } else if (activeMarkRef.current && points.length > 0) {
      activeMarkRef.current = {
        ...activeMarkRef.current,
        points: [activeMarkRef.current.points[0], points[points.length - 1]],
      };
    }
    scheduleDraw();
  };

  const finishGesture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const page = activeWhiteboardPage(stateRef.current);
    if (activeMarkRef.current && activeMarkRef.current.points.length > 0) {
      commitDraft([...page.marks, activeMarkRef.current]);
    } else if (draftRef.current && draftRef.current !== page.marks) {
      commitDraft(draftRef.current);
    }
    activeMarkRef.current = null;
    draftRef.current = null;
    scheduleDraw();
  };

  const page = activeWhiteboardPage(state);
  const pageIndex = Math.max(
    0,
    state.pages.findIndex((item) => item.id === page.id),
  );
  const canUndo = (state.past[page.id]?.length ?? 0) > 0;
  const canRedo = (state.future[page.id]?.length ?? 0) > 0;

  const placeText = () => {
    const draft = textDraft;
    setTextDraft(null);
    const value = draft?.value.trim();
    if (!draft || !value) return;
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    commitDraft([
      ...activeWhiteboardPage(stateRef.current).marks,
      {
        id: crypto.randomUUID(),
        kind: 'text',
        color,
        width: rect ? normalizedDistanceForPixels(widthPx, rect) : 0.02,
        points: [draft.point],
        text: value,
      },
    ]);
  };

  return (
    <section
      className="absolute inset-0 z-[70] flex flex-col bg-[#fffef8] text-slate-950"
      data-testid="teacher-whiteboard"
      aria-label="Whiteboard"
    >
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          data-testid="teacher-whiteboard-canvas"
          className={cn(
            'h-full w-full touch-none select-none',
            tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair',
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishGesture}
          onPointerCancel={finishGesture}
        />
        {textDraft ? (
          <form
            className="absolute z-10 flex max-w-sm gap-2 rounded-xl bg-white p-2 shadow-xl"
            style={{ left: `${textDraft.point.x * 100}%`, top: `${textDraft.point.y * 100}%` }}
            onSubmit={(event) => {
              event.preventDefault();
              placeText();
            }}
          >
            <input
              autoFocus
              aria-label="Whiteboard text"
              value={textDraft.value}
              onChange={(event) =>
                setTextDraft({ ...textDraft, value: event.target.value.slice(0, 200) })
              }
              className="min-h-12 min-w-40 rounded-lg border border-slate-300 px-3 text-lg"
            />
            <button type="submit" className={toolButton(true)}>
              Place
            </button>
          </form>
        ) : null}
        {confirmClear ? (
          <div
            role="alertdialog"
            aria-label="Clear this page"
            className="absolute inset-0 z-20 grid place-items-center bg-slate-950/40 p-6"
          >
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <h2 className="text-2xl font-semibold">Clear this page?</h2>
              <p className="mt-2 text-slate-600">The ink on this page will be removed.</p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  className="min-h-14 flex-1 rounded-xl bg-red-600 px-4 text-lg font-semibold text-white"
                  onClick={() => {
                    const cleared = clearWhiteboardPage(stateRef.current);
                    applyState(cleared, activeWhiteboardPage(cleared).id);
                    setConfirmClear(false);
                  }}
                >
                  Clear page
                </button>
                <button
                  type="button"
                  className="min-h-14 flex-1 rounded-xl border border-slate-300 px-4 text-lg font-semibold"
                  onClick={() => setConfirmClear(false)}
                >
                  Keep drawing
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <nav
        className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-3 py-2"
        aria-label="Whiteboard tools"
      >
        {onClose ? (
          <button type="button" onClick={onClose} className={toolButton(true)}>
            Back to lesson
          </button>
        ) : null}
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tool === item.id}
            aria-label={item.label}
            className={toolButton(tool === item.id)}
            onClick={() => setTool(item.id)}
          >
            <ToolIcon tool={item.id} />
            <span className="hidden lg:inline">{item.label}</span>
          </button>
        ))}
        <div className="flex items-center gap-1" aria-label="Pen colours">
          {COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Pen colour ${swatch}`}
              aria-pressed={color === swatch}
              className={cn(
                'size-11 rounded-full border-2',
                color === swatch ? 'border-slate-950' : 'border-transparent',
              )}
              style={{ backgroundColor: swatch }}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>
        {WIDTHS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={widthPx === item.px}
            aria-label={item.label}
            className={toolButton(widthPx === item.px)}
            onClick={() => setWidthPx(item.px)}
          >
            <span
              className="block rounded-full bg-current"
              style={{ width: 22, height: Math.max(2, item.px / 2) }}
            />
          </button>
        ))}
        <button
          type="button"
          aria-label="Undo"
          disabled={!canUndo}
          className={toolButton(false)}
          onClick={() => applyState(undoWhiteboard(stateRef.current), page.id)}
        >
          <Undo2 className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Redo"
          disabled={!canRedo}
          className={toolButton(false)}
          onClick={() => applyState(redoWhiteboard(stateRef.current), page.id)}
        >
          <Redo2 className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Clear page"
          disabled={page.marks.length === 0}
          className={toolButton(false)}
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Previous page"
          disabled={pageIndex === 0}
          className={toolButton(false)}
          onClick={() => {
            const next = selectWhiteboardPage(state, state.pages[pageIndex - 1].id);
            applyState(next, next.activePageId);
          }}
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <output className="min-w-16 text-center text-base font-bold tabular-nums" aria-label="Page">
          {pageIndex + 1} / {state.pages.length}
        </output>
        <button
          type="button"
          aria-label="Next page"
          disabled={pageIndex >= state.pages.length - 1}
          className={toolButton(false)}
          onClick={() => {
            const next = selectWhiteboardPage(state, state.pages[pageIndex + 1].id);
            applyState(next, next.activePageId);
          }}
        >
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={toolButton(false)}
          onClick={() => {
            const next = addWhiteboardPage(stateRef.current, crypto.randomUUID());
            applyState(next, next.activePageId);
          }}
        >
          New page
        </button>
        <p className="ml-auto px-2 text-sm font-medium text-slate-500" role="status">
          {status}
        </p>
      </nav>
    </section>
  );
}

function toolButton(active: boolean): string {
  return cn(
    'flex min-h-14 min-w-12 items-center justify-center gap-2 rounded-xl px-3 text-base font-semibold',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950',
    'disabled:cursor-not-allowed disabled:opacity-35',
    active ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-950 hover:bg-slate-200',
  );
}

function ToolIcon({ tool }: { tool: DrawTool }) {
  const className = 'size-5';
  if (tool === 'eraser') return <Eraser className={className} aria-hidden="true" />;
  if (tool === 'line') return <Minus className={className} aria-hidden="true" />;
  if (tool === 'rect') return <Square className={className} aria-hidden="true" />;
  if (tool === 'ellipse') return <Circle className={className} aria-hidden="true" />;
  if (tool === 'arrow') return <ArrowRight className={className} aria-hidden="true" />;
  if (tool === 'text') return <Type className={className} aria-hidden="true" />;
  return <Pencil className={className} aria-hidden="true" />;
}

function drawMark(
  context: CanvasRenderingContext2D,
  mark: WhiteboardMark,
  width: number,
  height: number,
) {
  if (mark.kind === 'freehand') {
    drawAnnotationStroke(context, mark, width, height);
    return;
  }
  const start = mark.points[0];
  const end = mark.points[1] ?? start;
  if (!start) return;
  const size = Math.max(1, mark.width * Math.min(width, height));
  context.strokeStyle = mark.color;
  context.fillStyle = mark.color;
  context.lineWidth = size;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const x1 = start.x * width;
  const y1 = start.y * height;
  const x2 = end.x * width;
  const y2 = end.y * height;
  if (mark.kind === 'text') {
    const fontSize = Math.max(28, size * 8);
    context.font = `600 ${fontSize}px sans-serif`;
    context.textBaseline = 'top';
    context.fillText(mark.text ?? '', x1, y1);
    return;
  }
  if (mark.kind === 'rect') {
    context.strokeRect(x1, y1, x2 - x1, y2 - y1);
    return;
  }
  if (mark.kind === 'ellipse') {
    context.beginPath();
    context.ellipse(
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      Math.max(1, Math.abs(x2 - x1) / 2),
      Math.max(1, Math.abs(y2 - y1) / 2),
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
    return;
  }
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  if (mark.kind === 'arrow') {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(16, size * 4);
    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(
      x2 - head * Math.cos(angle - Math.PI / 6),
      y2 - head * Math.sin(angle - Math.PI / 6),
    );
    context.moveTo(x2, y2);
    context.lineTo(
      x2 - head * Math.cos(angle + Math.PI / 6),
      y2 - head * Math.sin(angle + Math.PI / 6),
    );
    context.stroke();
  }
}
