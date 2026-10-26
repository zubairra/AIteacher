import { describe, expect, it } from 'vitest';

import {
  activeWhiteboardPage,
  addWhiteboardPage,
  clearWhiteboardPage,
  commitPageMarks,
  createWhiteboardState,
  decodeWhiteboard,
  encodeBoard,
  encodePage,
  encodedPageBytes,
  MAX_WHITEBOARD_PAGE_BYTES,
  redoWhiteboard,
  selectWhiteboardPage,
  undoWhiteboard,
  type WhiteboardMark,
} from '@/lib/teacher/whiteboard';

const stroke: WhiteboardMark = {
  id: 'stroke-1',
  kind: 'freehand',
  color: '#0f172a',
  width: 0.01,
  points: [
    { x: 0.1, y: 0.2, pressure: 0.5 },
    { x: 0.4, y: 0.6, pressure: 0.4 },
  ],
};

describe('teacher whiteboard', () => {
  it('keeps pages independent and restores the active page', () => {
    const started = createWhiteboardState('page-1');
    const drawn = commitPageMarks(started, 'page-1', [stroke]).state;
    const withSecond = addWhiteboardPage(drawn, 'page-2');
    expect(withSecond.activePageId).toBe('page-2');
    expect(activeWhiteboardPage(withSecond).marks).toEqual([]);
    const back = selectWhiteboardPage(withSecond, 'page-1');
    expect(activeWhiteboardPage(back).marks).toEqual([stroke]);
  });

  it('undoes and redoes only the active page', () => {
    const drawn = commitPageMarks(createWhiteboardState('page-1'), 'page-1', [stroke]).state;
    const undone = undoWhiteboard(drawn);
    expect(activeWhiteboardPage(undone).marks).toEqual([]);
    const redone = redoWhiteboard(undone);
    expect(activeWhiteboardPage(redone).marks).toEqual([stroke]);
    const cleared = clearWhiteboardPage(redone);
    expect(activeWhiteboardPage(cleared).marks).toEqual([]);
    expect(undoWhiteboard(cleared).pages[0]?.marks).toEqual([stroke]);
  });

  it('round-trips quantized strokes without the undo stack', () => {
    const state = commitPageMarks(createWhiteboardState('page-1'), 'page-1', [stroke]).state;
    const board = encodeBoard('teacher-a', 'lesson-1', state, 10);
    const page = encodePage('teacher-a', state.pages[0]);
    const decoded = decodeWhiteboard(board, new Map([['page-1', page]]));
    expect(decoded?.activePageId).toBe('page-1');
    expect(decoded?.past).toEqual({});
    expect(decoded?.pages[0]?.marks[0]).toMatchObject({
      id: 'stroke-1',
      kind: 'freehand',
      color: '#0f172a',
    });
    expect(decoded?.pages[0]?.marks[0]?.text).toBeUndefined();
    expect(decoded?.pages[0]?.marks[0]?.points[0]?.x).toBeCloseTo(0.1, 3);
    expect(JSON.stringify(page)).not.toMatch(/sk-/);
  });

  it('refuses a page that would exceed the Firestore document limit', () => {
    const points = Array.from({ length: 120_000 }, (_, index) => ({
      x: (index % 100) / 100,
      y: 0.5,
      pressure: 0.5,
    }));
    const mark: WhiteboardMark = {
      id: 'huge',
      kind: 'freehand',
      color: '#000000',
      width: 0.01,
      points,
    };
    expect(encodedPageBytes({ id: 'page-1', marks: [mark] })).toBeGreaterThan(
      MAX_WHITEBOARD_PAGE_BYTES,
    );
    const state = createWhiteboardState('page-1');
    const result = commitPageMarks(state, 'page-1', [mark]);
    expect(result.rejected).toBe(true);
    expect(result.state).toBe(state);
  });
});
