# Teacher Platform Phase 3 — Smart-board Teach Mode

Phase 3 adds a dedicated human-operated presentation surface to the teacher lesson workflow. It does not add native activities, a live AI assistant, student sessions, or simulation infrastructure.

## Inspection findings and architecture decision

The existing `PlaybackChromeRoot` is not a small presentation component. It owns AI narration, chat sessions, roundtable UI, TTS, action sequencing, sidebars, topic-switch confirmation, and learner discussion state. Reconfiguring it globally would risk legacy OpenMAIC playback.

The reusable playback boundary is lower in the tree: `SceneRenderer`, `SceneProvider`, `ContainBox`, `InteractiveIframeHost`, and `useStageStore`. Teach Mode wraps those existing pieces with teacher-specific chrome. This preserves every existing scene dispatcher and renderer while leaving `PlaybackChromeRoot` unchanged.

Other relevant findings:

- Fullscreen handling in `PlaybackChromeRoot` is internal to that component, so Teach Mode uses the same browser Fullscreen API through a small teacher-specific adapter.
- Interactive scenes render through a fixed, keep-alive iframe host. Teach Mode mounts that host alongside the normal interactive placeholder so generated HTML retains its existing sandbox and lifecycle.
- The quiz renderer owns its submission/review reveal lifecycle. There is no general scene-level reveal contract, so Teach Mode does not invent a misleading Reveal button.
- `TeacherNotesPanel` originally owned its own trigger and open state. Its note content was extracted into `TeacherNotesContent` so review and Teach Mode share the same structured rendering.

## Routes and entry

- `/lessons/[id]/edit` shows **Teach Now** only when the loaded Stage has valid version 1 `teacherLesson` metadata.
- `/lessons/[id]/teach` reloads the Stage through the existing `ClassroomSurface`/`runClassroomLoad` persistence path. It therefore supports direct links and refreshes without navigation state.
- Missing lessons use the existing classroom loading/not-found/error states. Missing or malformed teacher metadata receives a bounded Teach Mode unavailable screen instead of crashing or mutating legacy data.
- Exit Teaching leaves browser fullscreen if necessary and returns to `/lessons/[id]/edit`.

## Presentation wrapper

`TeacherTeachMode` reads ordered scenes and `currentSceneId` from `useStageStore`. Previous/next actions call the existing `setCurrentSceneId`; there is no second scene-navigation store. Slides, quizzes, interactives, and PBL scenes continue through `SceneRenderer`. Non-interactive scenes retain the existing responsive 16:9 `ContainBox`; interactive scenes use the full available content area and the established iframe pool.

The presentation toolbar uses 48–56 CSS pixel controls, visible focus states, explicit disabled states, persistent previous/next controls, position, drawing tools, notes, fullscreen, and exit. Arrow keys navigate unless focus is in an input, textarea, select, slider, or content-editable element.

## Annotation architecture

No drawing dependency was added. A focused canvas overlay satisfies Phase 3 with substantially less bundle and UI surface than Excalidraw.

### Coordinates and rendering

Strokes store points normalized to `[0, 1]` relative to the rendered lesson surface. Pen width is stored relative to the shortest surface dimension. A `ResizeObserver` and device-pixel-ratio-aware canvas redraw preserve alignment and visual sharpness through resize, browser zoom, and fullscreen transitions.

Rendering is imperative canvas drawing. Pointer moves update a mutable active stroke and schedule at most one redraw per animation frame; React state is committed when the pointer gesture ends rather than on every sample.

### Pointer handling

The overlay uses Pointer Events and coalesced samples when supported. Mouse, touch, and pen share the same path. Pressure is recorded with a safe fallback but is not required for drawing. `touch-action: none` and pointer capture are enabled only while pen or eraser mode is active. When annotation mode is off, the canvas has `pointer-events: none`, restoring direct quiz and interactive-scene input.

### History and erasing

Annotations live in an ephemeral `TeacherAnnotationState` keyed by scene ID. Returning to a scene during the same Teach session restores its strokes. Pen gestures, eraser gestures, and clear operations each create bounded undo history entries; redo is invalidated by a new change. Erasing performs geometric hit-testing against annotation segments and removes stroke data—it never paints with a background color and cannot erase lesson content. Clear requires confirmation when strokes exist.

Annotation state is not written to Stage/Scene persistence and is discarded when Teach Mode unmounts.

## Teacher notes

The Notes control is enabled only when the current scene has valid structured teacher notes. Notes open in a compact quick-peek drawer and close on demand or scene navigation. A second-screen/private presenter view is intentionally outside Phase 3; on a single smart board, teachers should treat the drawer as briefly visible classroom content.

## Fullscreen

Fullscreen is requested only from an explicit teacher action. `fullscreenchange` keeps the control state synchronized, including native Escape exits. If the API is missing or permission is denied, Teach Mode remains fully operational in its distraction-reduced route and displays a concise status message. Fullscreen is never a loading or rendering dependency.

## Legacy compatibility and safety

- Legacy `/advanced` and `/classroom/[id]` playback are unchanged.
- `PlaybackChromeRoot`, existing whiteboard behavior, scene schemas, persistence tables, quiz runtime, and interactive HTML sandbox were not rewritten.
- Teach Mode performs no generation or AI requests.
- The shell contains no subject-, grade-, curriculum-, or topic-specific logic.

## Tests

Focused tests cover navigation boundaries, typing-safe keyboard shortcuts, normalized coordinate conversion, cross-resolution stability, stroke creation, geometric erasing, undo/redo/clear, per-scene isolation, metadata compatibility, and fullscreen enter/exit/fallback.

The deterministic Playwright acceptance creates a teacher lesson through mocked generation endpoints, enters Teach Mode from review, verifies four target viewport sizes, navigates both directions, draws, restores underlying pointer interaction, opens/closes notes, clears annotations, enters/exits fullscreen where supported, refreshes the direct route, and exits to review.

Final command results are recorded in the Phase 3 completion report and the known-failure ledger.

## Known limitations

- Physical smart-board finger/stylus hardware was not available for automated testing; the manual matrix is in `docs/smartboard-test-plan.md`.
- Annotation strokes are session-only by design.
- Existing quizzes retain their learner-oriented attempt/review flow. A teacher-controlled native activity/reveal model belongs to Phase 4.
- Teacher notes are visible on a single shared display while their drawer is open.

## Phase 4 extension points

Phase 4 should add versioned native activity schemas to the additive interactive-content contract and a registry that resolves validated activity type to renderer. The activity renderer should mount through `SceneRenderer`/the interactive scene branch, not through the annotation canvas.

`TeacherTeachMode` is the presentation owner and toolbar extension point. It can open an activity overlay or navigate to an activity scene while retaining current scene ID and per-scene annotations. Returning should close the activity surface and reveal the same lesson scene without reconstructing the Stage. Activity progress, team scores, and reset state should remain a separate ephemeral presentation-state slice; they must not be stored in annotation history or mutate the source lesson unless an explicit save contract is introduced.
