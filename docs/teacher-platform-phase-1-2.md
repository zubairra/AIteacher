# Teacher Platform Phases 1–2

This document describes the additive teacher shell and teacher-led generation path built on the audited OpenMAIC foundation. It intentionally does not repeat the Phase 0 repository audit.

## Architecture added

The root route is now the teacher dashboard. The original OpenMAIC discovery/workbench page remains intact at `/advanced`, preserving access to legacy and advanced functionality. The teacher shell adds `/lessons`, `/lessons/new`, and `/lessons/[id]/edit` while continuing to use the existing Stage/Scene, DocumentStore, generation preview, scene generator, renderers, and editor.

`TeacherLessonRequest` is the validated product boundary. `compileTeacherLessonRequirement` converts that structure into OpenMAIC's existing requirement input, while `generationMode: "teacher-led"` and versioned `teacherLesson` metadata carry non-fragile mode and product context alongside it. There is no second generator or database.

## Routes

- `/` — teacher dashboard and recent lessons;
- `/lessons` — all saved lessons;
- `/lessons/new` — teacher lesson brief and optional existing material uploader;
- `/lessons/[id]/edit` — teacher review route backed by the existing classroom load and editor surfaces;
- `/advanced` — preserved OpenMAIC legacy/advanced experience;
- `/generation-preview` — unchanged shared progress pipeline, now aware of explicit teacher mode.

## Types and schemas

`lib/teacher/lesson-request.ts` defines:

- `TeacherLessonRequest` and Zod validation;
- the four V1 teaching-style values;
- normalized duration guidance;
- version 1 `TeacherLessonMetadata`;
- version 1 `TeacherNotes`;
- safe metadata/note deserialization;
- the deterministic compatibility compiler.

Teacher metadata is additive on the app Stage shape and DocumentSummary. Browser and PostgreSQL document listings return it when present. Missing or malformed metadata is treated as legacy data, so older OpenMAIC lessons remain openable and do not break the dashboard.

## Generation adapter and mode

`createTeacherGenerationSession` creates the same session consumed by `/generation-preview`. It reuses the existing document blob ingestion and extractor configuration for optional materials. The request compiler supplies a clear human-teacher brief; structured metadata remains separate so downstream behavior never relies on string matching.

The generation package recognizes teacher mode only when both the explicit mode and valid versioned metadata are present. Its context gives the outline, slide, quiz, and interactive-outline prompts the requested subject, grade, topic, duration, curriculum, and style. Style presets have distinct instructions, and duration bands change scope guidance without imposing rigid slide counts.

Teacher mode skips AI classroom-roster generation and AI narration actions. It still uses the existing scene-content and scene-assembly path, including slides, quizzes, and safe existing interactives. Legacy generation is unchanged when teacher mode is absent.

## Teacher notes

Outlines may include concise version 1 teacher notes. Model output is normalized to known bounded string fields before it reaches a Scene. Notes are persisted additively on the existing Scene and exposed through an optional Teacher Notes popover in the existing editor; they do not dominate projected content.

## Review and editing

After the first scene is saved, teacher lessons open at `/lessons/[id]/edit`. `ClassroomSurface` continues background generation of remaining scenes with the original structured requirements. The existing OpenMAIC editor is preloaded and entered automatically for this route, including while later materialized pages are still generating. Existing save, navigation, regeneration, and content editing behavior is reused.

No Smart-Board Teach Mode, presentation shell, annotation overlay, native activity engine, student workflow, or live AI teacher assistant is implemented in these phases.

## Significantly changed areas

- `app/(teacher)/` and `components/teacher/` — teacher shell, dashboard, lesson form, notes UI;
- `app/advanced/page.tsx` — preserved legacy home;
- `lib/teacher/` — validation, compilation, session preparation, dashboard mapping;
- `app/generation-preview/` — explicit teacher handoff and AI-agent suppression;
- `packages/@openmaic/generation/` — teacher context, duration/style instructions, note normalization;
- `packages/@openmaic/storage/` and `lib/utils/stage-storage.ts` — additive metadata summaries;
- `components/classroom/ClassroomSurface.tsx`, `components/stage.tsx`, and `components/edit/EditChromeRoot.tsx` — editor reuse for teacher review;
- `tests/teacher/` — focused behavioral coverage.

## Tests

Focused Vitest coverage passes for request validation, compilation, style/duration differences, explicit teacher-mode prompt context, note normalization and Scene persistence, metadata compatibility, and dashboard mapping. The broad suite completed with 8,690 passed, 104 failed, and 98 skipped: the failure and skip counts exactly match Phase 0, with eight additional passing tests.

The local Chromium acceptance spec validates the empty dashboard, required-field errors, the exact Grade 8 Chemistry form, explicit teacher-mode request payload, generation-preview handoff, existing editor entry, persistence on the dashboard, and reopening. AI endpoints are deterministically mocked in this browser test; a live third-party model call was not made because test credentials are intentionally not used. Production build, TypeScript, ESLint, and Prettier checks pass. Existing build warnings and Windows-only package-test failures remain recorded in `docs/testing-known-failures.md`.

## Known limitations

- Teach Now is intentionally absent until Phase 3.
- Teacher notes are generated at outline time and edited through existing scene data capabilities; a dedicated structured notes editor is not part of Phases 1–2.
- Interactive content continues to use OpenMAIC's existing generation and security boundaries. Native structured classroom activities belong to Phase 4.
- A configured supported model provider is required for live generation. Provider credentials remain in the existing settings architecture and are never embedded in client source.

## Phase 3 integration points

- **Teach Now entry:** add the action from the teacher review route for stages with valid `teacherLesson` metadata. The destination should load by Stage id through `ClassroomSurface`/`runClassroomLoad` rather than clone lesson data.
- **Fullscreen playback:** build on `components/edit/PlaybackChromeRoot.tsx`, the current Stage mode dispatch in `components/stage.tsx`, the existing scene renderers, and `useStageStore` scene navigation.
- **Annotations:** layer a teacher-owned annotation surface above the playback canvas without mutating generated slide elements. Reuse the audited whiteboard/annotation primitives before evaluating another dependency.
- **Teacher notes during presentation:** reuse `scene.teacherNotes` and the field normalization in `teacher-mode.ts`; presentation chrome should reveal notes only to the teacher when an appropriate private display path exists.
- **Large touch controls:** create a distinct teacher presentation chrome around existing playback/navigation APIs. Do not enlarge or repurpose the editor controls globally.
