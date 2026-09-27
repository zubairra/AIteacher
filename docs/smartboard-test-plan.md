# Smart-board Teach Mode manual test plan

This plan validates classroom hardware behavior that automated browser tests cannot prove. Record board model, browser/version, OS, input device, display resolution, browser zoom, and pass/fail notes for every run.

## Test data

Use one teacher-created lesson containing at least:

- two ordinary slide scenes;
- one quiz scene;
- one interactive HTML scene;
- teacher notes on at least two scenes.

Do not use external AI generation during the presentation checks. Open a saved, fully generated lesson.

## Resolution matrix

Run the core workflow at:

- 1366 × 768;
- 1920 × 1080;
- 2560 × 1440;
- 3840 × 2160.

At every resolution verify that lesson content remains centered and uncropped, the toolbar stays fully on-screen, position text is readable, touch targets do not overlap, notes fit within the viewport, and annotations remain aligned after resizing.

## Input matrix

### Finger

- Tap Previous, Next, Draw, Eraser, Notes, Fullscreen, and Exit.
- Draw short dots, slow curves, and a fast diagonal drag.
- Erase strokes by tapping and dragging across them.
- With Draw off, scroll or interact inside quizzes and interactive scenes.
- Confirm ordinary touches do not select text or scroll the page while drawing is active.

### Stylus

- Draw slow and fast strokes near every content edge.
- Test pressure variation if the board/browser reports pressure; drawing must also work without it.
- Test the stylus eraser end if the hardware maps it to ordinary pointer input. Phase 3 does not promise automatic hardware-eraser detection, so record actual behavior.
- Verify palm/finger behavior according to the board's own palm-rejection settings.

### Mouse

- Navigate with buttons and Left/Right Arrow keys.
- Draw, erase, undo, redo, and clear.
- Verify arrow keys do not change scenes while typing in a quiz/input field.
- Verify visible keyboard focus through every toolbar control.

## Core workflow

1. Open the dashboard and a saved teacher lesson.
2. Enter review and select Teach Now.
3. Confirm the first scene shows Previous disabled and the last shows Next disabled.
4. Navigate rapidly forward/backward ten times and confirm the selected scene and counter agree.
5. Draw on scene A, navigate to scene B, draw a different mark, and return to scene A. Confirm scene A's original mark returns.
6. Undo, redo, erase, and clear. Confirm underlying lesson pixels are never removed.
7. Turn Draw off and interact with the quiz and interactive HTML scene.
8. Open and close teacher notes. Confirm text is readable from the teacher position and note that students can see it on a single shared display.
9. Enter fullscreen, navigate, draw, and exit fullscreen with the toolbar. Also press Escape and confirm the browser exits fullscreen cleanly.
10. Resize the window or change display mode while a diagonal annotation is visible. Confirm endpoints remain attached to the same content locations.
11. Exit Teaching and confirm the lesson review/editor returns with saved lesson content intact.
12. Refresh `/lessons/[id]/teach` directly and confirm the lesson reloads.

## Viewing-distance and accessibility checks

- From the back of the intended classroom, read slide content, the scene counter, and primary control labels.
- Confirm active Draw/Eraser states are distinguishable without relying solely on subtle color changes.
- Check light and dark lesson backgrounds for red pen visibility.
- Test browser zoom at 80%, 100%, 125%, and 150% without toolbar clipping.
- Enable reduced-motion preference and confirm no required state depends on animation.
- Confirm icon-only controls expose useful accessible names with a screen reader or browser accessibility inspector.

## Fullscreen and browser checks

- Allow fullscreen and verify entry/exit.
- Deny fullscreen permission and confirm the in-window fallback remains usable.
- Exit using Escape, the toolbar, and Exit Teaching.
- Confirm browser UI returning after fullscreen does not shift existing annotations.

## Stress and recovery

- Draw continuously for two minutes and watch for visible lag.
- Create at least 30 strokes, then undo and redo repeatedly.
- Clear a marked scene and cancel the confirmation once before accepting it.
- Switch scenes while notes are open and while Draw is active; both transient tools should close/deactivate safely.
- Attempt rapid double taps on navigation controls and confirm scene order remains valid.

## Hardware verification status

Automated Chromium coverage validates mouse/pointer behavior, four viewport sizes, fullscreen controls, navigation, notes, refresh, and exit. Physical finger input, active stylus pressure, device-specific eraser buttons, palm rejection, projector readability, and vendor browser fullscreen policies remain **unverified until this plan is run on actual classroom hardware**.
