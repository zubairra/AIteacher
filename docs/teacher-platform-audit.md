# SmartBoard AI — OpenMAIC Foundation Audit

**Audit date:** 2026-09-25

**Audited revision:** `21d83ec51b90` (`release: v1.1.0 (#1677)`)

**Working branch:** `feature/teacher-smartboard`

**Scope:** Phase 0 only. No product features or production behavior were changed.

## Executive conclusion

OpenMAIC is a strong foundation for SmartBoard AI. It already contains most of the difficult horizontal systems: streamed course generation, a typed lesson/scene model, slide rendering and editing, playback, quizzes, generated interactive HTML, PBL workflows, multi-agent chat, AI whiteboards, document ingestion, media generation, TTS/ASR, local and server persistence, provider abstraction, exports, and a large automated test suite.

The correct V1 strategy is therefore **an additive teacher product layer over the existing document, generation, renderer, playback, storage, provider, and export systems**. Replacing those systems would add risk without creating teacher value.

The largest genuine gaps are product- and classroom-specific:

- a simple teacher dashboard and structured lesson-creation flow;
- teacher-oriented generation contracts and prompts;
- a large-touch, distraction-free presentation shell;
- human freehand annotations over lesson content;
- native, validated whole-class activity components;
- a teacher-facing in-lesson assistant with bounded actions;
- typed teacher notes and component-level regeneration;
- a small registry of trusted, configurable educational simulations.

OpenMAIC's current whiteboard is an **AI-authored presentation canvas**, not a human pen/eraser annotation layer. Its current multi-agent experience and quiz lifecycle are primarily learner-facing. They should be retained as infrastructure, adapted selectively, and hidden from the primary V1 teacher journey rather than removed.

## Baseline status

The repository was cloned without source modifications and checked out on the new branch before auditing. The install and checks used the repository-pinned `pnpm@10.28.0`; the desktop shell's default pnpm 11 is not compatible with the existing `node_modules` metadata.

| Check | Result | Notes |
| --- | --- | --- |
| Install | Pass | `pnpm install --frozen-lockfile`; all OpenMAIC packages built. pnpm reported upstream dependencies whose install scripts are intentionally ignored pending approval. |
| Formatting | Pass | `pnpm check` reports all files formatted. |
| ESLint | Pass with warnings | 0 errors, 20 warnings. Warnings are pre-existing hook dependency, unused symbol, anonymous default export, and unused disable findings. |
| TypeScript | Pass | `pnpm exec tsc --noEmit`. |
| Unit/integration tests | Baseline failure | 774 files: 736 passed, 26 failed, 12 skipped. 8,884 tests: 8,682 passed, 104 failed, 98 skipped. |
| Production build | Pass with warnings | Next.js 16.3.3 production build completed and generated 52 static pages. Turbopack reported 8 pre-existing Edge/runtime and dynamic-filesystem tracing warnings; Next.js also reports the `middleware` convention as deprecated. |

The test failures were reproduced on the untouched upstream revision. They are not caused by this audit. The dominant causes are:

1. Windows-host assumptions in tests that invoke `/bin/bash`, `grep`, and `true`.
2. Numerous 5-second timeouts in IndexedDB/PGlite concurrency, chat runtime, material extraction, media, ESLint-boundary, and React interaction tests under this host.
3. A smaller set of non-timeout behavioral assertions, including duplicate persistence notifications, cross-test state leakage in agent/interactive observations, and workbench material-probe expectations.

Before feature work is treated as regression-safe, CI should provide one canonical Linux baseline and the project should either make Windows-supported tests portable or explicitly exclude platform-specific CI-contract tests on Windows. New SmartBoard tests must be tracked separately from these known upstream failures so the baseline cannot hide regressions.

## Repository and runtime architecture

OpenMAIC is a pnpm monorepo centered on a Next.js App Router application.

```text
Teacher/client UI
  -> Next.js routes and API handlers
  -> generation / agent / media orchestration
  -> provider-neutral AI and extraction adapters
  -> MaicDocument (Stage + ordered Scenes + outline)
  -> browser IndexedDB or server PostgreSQL + asset storage
  -> renderer/editor/playback/export packages
```

### Workspace packages

| Package | Responsibility | SmartBoard disposition |
| --- | --- | --- |
| `@openmaic/dsl` | Stage, Scene, content, actions, validation, serialization contracts | Preserve; add only versioned, optional teacher/native-component fields. |
| `@openmaic/generation` | Generation-facing types and utilities | Preserve; add a teacher request adapter rather than a parallel generator. |
| `@openmaic/storage` | Normalized stage/scene/outline storage abstractions | Reuse unchanged where possible. |
| `@openmaic/importer` | PPTX and source import pipeline | Reuse. |
| `@openmaic/renderer` | Canvas and scene rendering | Reuse as the visual core of Teach Now. |
| `@openmaic/editor` | Canvas editing primitives and UI | Reuse for review/edit; do not expose its full complexity in presentation mode. |
| `mathml2omml` | Equation conversion | Preserve. |
| `pptxgenjs` | Editable PowerPoint generation | Preserve. |

The application currently exposes a large home page, generation preview, classroom playback, workspace, and workbench entry points. The home and generation-preview pages are large orchestration components. The teacher shell should be composed in new, smaller route components that call existing services; adding another mode deeply inside the monolithic pages would make upstream merges and testing harder.

### Canonical document model

`MaicDocument` consists of:

- a `Stage` with identity, display metadata, timestamps, language/style, whiteboard and agent settings, and interaction modes;
- ordered `Scene` records;
- an outline stored as opaque structured data;
- a DSL version.

Scene content is discriminated as:

- `slide` — editable canvas elements and remarks;
- `quiz` — single choice, multiple choice, and short-answer questions;
- `interactive` — URL/HTML and generic widget configuration;
- `pbl` — project/problem-based learning state.

This is the correct lesson aggregate for SmartBoard AI. A teacher lesson should remain a Stage with Scenes rather than introducing a second lesson database or renderer.

## Capability audit

| Requested capability | What exists now | Decision |
| --- | --- | --- |
| Course/lesson generation | Requirement + materials become streamed outlines, then scene content/actions/media are generated in parallel. | Reuse the pipeline; add typed teacher inputs and teacher-oriented prompts. |
| Slides | Rich editable canvas content, layout generation, image/video/chart/table/LaTeX support. | Reuse. |
| Presentation/playback | Playback engine, scene navigation, fullscreen, action sequencing, keyboard controls, TTS, scene renderers, iframe pooling. | Reuse engine/renderers; replace the teacher-facing chrome in Teach Now. |
| Quizzes | Native single/multiple/short-answer UI, local and AI grading, attempts, retry/review. | Reuse question schema/rendering; add a teacher-controlled board presentation mode. |
| Interactive HTML | Model-generated self-contained HTML in sandboxed iframes with runtime observations and error reporting. | Retain for legacy/general content; do not use it for the six common V1 activities. |
| PBL | Full learner-oriented PBL orchestration, instructor/simulator/evaluation APIs. | Preserve but hide from the primary V1 workflow. |
| Agent system | Agent runtime, sessions, tools, Director/child routing, current-scene evidence, stage context, editable course tools. | Reuse plumbing; create a dedicated teacher-assistant persona and action policy. |
| Whiteboard | AI-created canvases, element actions, history/snapshots, clear/delete, pan/zoom. | Keep for AI explanations; add a separate human annotation overlay. |
| Upload/parsing | PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, text/Markdown, images, and provider-dependent audio/video; multiple extractors and asset-backed storage. | Reuse upload, extraction, MIME, size, and material-reference systems. |
| Image/video generation | Provider-neutral generation and media orchestration with asset storage/caching. | Reuse; generate expensive assets lazily where appropriate. |
| TTS/ASR | Provider abstractions, voice selection/cloning paths, transcription and playback. | Preserve; not central to the default teacher flow. |
| Persistence | IndexedDB locally; PostgreSQL server persistence; normalized stage/scene/outline records; folders, ownership metadata, soft delete, publication and assets. | Reuse. Add optional versioned metadata inside the existing document contract. |
| Provider abstraction | Vercel AI SDK-based LLM calls plus registries/adapters for OpenAI, Azure, Anthropic, Bedrock, Google, OpenAI-compatible/local providers, search, images, video, TTS and ASR. | Preserve strictly; no SmartBoard feature may depend on one vendor. |
| Editing/regeneration | Direct canvas editing, quiz editing, scene patch/regeneration, insert/delete/reorder/duplicate tools, media replacement. | Reuse; expose safer component-level teacher actions. |
| Exports | Editable PPTX, HTML/resource pack, classroom ZIP, script Markdown/DOCX, optional MP4 pipeline. | Preserve. |
| Recent/saved lessons | Stage listing, search/folders, local/server storage, timestamps. | Reuse for dashboard. Add whole-lesson duplication as a teacher action. |
| Teacher notes | Slide remarks and generated lecture/speaker notes exist. | Adapt talking points; add explicit teacher-only note, misconception, and teaching-tip fields/UI. |
| Whole-class activity engine | Quizzes plus arbitrary generated game HTML. | Missing as a trusted structured/native registry. Build additively. |
| Curated simulations | Generic generated simulations/3D HTML only. | Missing. Add a small validated component registry in Phase 6. |

## Detailed findings

### Generation

The classic generator already performs the desired high-level workflow:

1. accept a requirement and optional extracted materials;
2. stream scene outlines;
3. generate independent scene content, actions, media, and audio concurrently;
4. progressively persist and display results;
5. retry failed work at scene/media boundaries.

The missing part is intent, not infrastructure. `UserRequirements` is essentially a free-form requirement plus user profile and feature toggles. Grade, subject, duration, curriculum, and teaching style are inferred rather than first-class. Current prompts frequently describe a learner/student experience and AI narration, with default durations around 15–30 minutes. SmartBoard AI requires the inverse contract: concise board content and teacher support for a human-led 40-minute class.

Phase 2 should introduce a validated `TeacherLessonRequest` and compile it into the existing outline/content pipeline. The outline planner should select only pedagogically useful sections and return structured purposes (hook, explanation, worked example, quick check, activity, recap, exit question) without forcing every category into every lesson. Scene generators should receive the same teacher contract and relevant material citations.

Generated JSON is repaired and post-processed, and DSL validators protect storage boundaries, but generation-specific structured outputs are not uniformly validated with strict discriminated schemas. Teacher lesson metadata, activities, simulations, quick questions, and assistant actions must be schema-validated before persistence or rendering.

### Review, editing, and regeneration

The existing editor and agent course tools already provide most low-level operations: patch content, regenerate a scene, insert/delete/reorder/duplicate scenes, edit canvas elements, edit quiz data, and replace media. Smart regeneration should be a constrained UI and service layer over these operations.

For example, “make this explanation simpler” should identify a scene/element, ask the model for a typed patch, validate it, show a preview, then apply it through the established scene update path. It should not regenerate the lesson or let an assistant write arbitrary document JSON.

### Playback and smart-board mode

`PlaybackEngine`, `PlaybackChromeRoot`, `CanvasArea`, the scene renderers, action sequencing, fullscreen handling, current-scene state, TTS, and navigation are directly reusable. Existing code supports keyboard navigation and browser fullscreen.

The current chrome is not suitable as the SmartBoard V1 UI. Some toolbar controls are approximately 28 px, advanced panels compete for space, and learner-oriented roundtable/chat affordances are prominent. Teach Now should be a dedicated shell around the same playback engine with:

- minimum 48–56 px touch targets;
- high-contrast, large type and focus states;
- persistent previous/next and scene count;
- explicit answer reveal/reset behavior;
- annotation, activity, quick-question, notes, and assistant drawers;
- 16:9 layouts tested at 1280×720, 1920×1080, and 3840×2160;
- graceful browser-fullscreen denial and a visible exit affordance.

Presentation state should be separate from durable lesson content. Temporary answer reveals, score changes, and annotations should not silently mutate the lesson.

### Whiteboard and annotations

OpenMAIC's whiteboard should not be replaced. It is valuable for AI-produced explanations and can create/manipulate text, shapes, lines, tables, charts, code, and LaTeX with snapshot/history support.

It is not, however, a teacher drawing tool. Its canvas is a rendered AI-authored board with pan/zoom; it lacks a direct smart-board pen, stroke eraser, touch-friendly shapes/arrows/text controls, and a transparent overlay over lesson scenes.

Phase 3 should add an independent annotation overlay keyed by stage and scene, supporting pointer/pen events, undo/redo, clear, stroke erasing, and optional shapes/text. Start with a focused SVG/canvas implementation and measure latency on touch hardware. Evaluate Excalidraw only if the required editing behavior cannot be met economically; introducing it immediately would add a large UI/runtime dependency and create styling/embedding work without evidence that OpenMAIC's AI whiteboard must be replaced.

### Activities and quizzes

The existing quiz model is suitable for multiple-choice questions and can represent True/False as two choices, but the current flow assumes a learner submits an answer and accumulates attempts/results. A board mode should reuse its question and explanation rendering while putting the teacher in control of reveal, reset, and “next question.”

Match pairs, drag-and-drop, spin the wheel, and Team A vs Team B do not exist as trusted native components. They may be approximated by generated HTML today, but that violates the desired reusable architecture.

The least disruptive design is to keep `SceneType = interactive` and extend interactive content additively with a native renderer descriptor. Legacy `html`/`url` content remains valid. Native activities use a versioned discriminated union, for example:

```ts
type NativeActivity =
  | { version: 1; type: 'multiple_choice'; question: string; options: Option[] }
  | { version: 1; type: 'true_false'; statement: string; answer: boolean }
  | { version: 1; type: 'match_pairs'; pairs: Pair[] }
  | { version: 1; type: 'drag_drop'; items: Item[]; targets: Target[] }
  | { version: 1; type: 'spin_wheel'; entries: WheelEntry[] }
  | { version: 1; type: 'team_score'; questions: Question[]; teams: Team[] };
```

The LLM returns only data. Zod/JSON-schema validation, bounded string/list sizes, stable IDs, accessibility labels, and deterministic renderers sit between the model and UI. Team scores and activity progress are ephemeral by default and can be explicitly saved as presentation state if later required.

### Interactive components

OpenMAIC can generate arbitrary simulations as HTML, but it has no curated Atom Builder, Number Line, Fraction Visualizer, Periodic Table, or Geometry Board registry. Phase 6 should use the same native interactive extension proposed for activities:

```ts
type NativeSimulation = {
  version: 1;
  component: 'atom-builder' | 'number-line' | 'fraction-visualizer';
  config: unknown; // validated by the selected component schema
};
```

Each registered component owns its validator, default state, renderer, reset logic, teacher controls, and accessibility contract. V1 should implement only enough components to prove this registry.

### PhET

No PhET integration exists in the audited repository. PhET's own development overview describes simulations and dependencies as many repositories and recommends published stable builds for most consumers; it also documents iframe embedding. Simulations are generally GPLv3, reusable libraries are generally MIT, and adapted builds have separate branding requirements. See the official [development overview](https://github.com/phetsims/phet-info/blob/main/doc/phet-development-overview.md), [licensing page](https://phet.colorado.edu/en/licensing), and [brand repository](https://github.com/phetsims/brand).

Recommendation: do not bundle, fork, or depend on PhET for V1. If added later, use an allowlisted optional external embed/catalog entry after legal/product review, preserve attribution, provide a network/error fallback, and ensure lessons still work without it.

### Live AI teacher assistant

The current Pi/agent stack already knows the stage, outline, current scene, current action, interactive state, whiteboard state, and selected elements. It can read scene evidence and invoke course editing tools. This is excellent infrastructure for a contextual assistant.

Its persona and UX are wrong for V1: the current system is an in-class multi-agent experience that addresses a user/student and can surface several agent identities. The teacher needs one concise assistant that never takes control of the lesson.

Add a dedicated teacher-assistant route/policy that reuses provider resolution, `read_scene` evidence, material references, and audited course tools. Its response contract should be a concise message plus optional typed actions such as `show_now`, `insert_scene`, `create_activity`, and `create_question`. Mutating actions require an explicit teacher click and validation. The assistant drawer must remain inside Teach Now.

### Materials and document ingestion

The ingestion system is broader than the V1 requirements. It normalizes MIME types, applies file/count/size limits, stores source bytes through the asset system, and selects local or configured extractors. Supported paths include PDF, DOC/DOCX, PPT/PPTX, spreadsheets, text/Markdown, images, and provider-dependent audio/video. Existing extractors include unpdf, MinerU, AliDocMind, plain text, and local media/ASR paths.

The teacher create screen should reuse the existing upload, extraction, material bundling, progress, and error paths. It should present only supported teacher-facing formats and avoid exposing provider-specific complexity.

### Persistence and lesson library

Browser persistence uses IndexedDB; server persistence uses normalized PostgreSQL stage, scene, and outline records plus stage metadata, folders, revision handling, soft deletion, publication, and pluggable asset storage. The API already supports stage listing and recent/saved course retrieval.

No separate lessons table is needed for V1. Extend the Stage/document contract with an optional, versioned teacher profile:

```ts
interface TeacherLessonMetadataV1 {
  schemaVersion: 1;
  subject: string;
  grade: string;
  topic: string;
  durationMinutes: number;
  curriculum?: string;
  teachingStyle: 'balanced' | 'visual' | 'explanation' | 'activity';
  materialRefs: string[];
}
```

Add optional scene teacher support for talking points, misconceptions, tips, and source references. These fields should be added through the DSL/app validators and serialization schema, not smuggled into the opaque outline. PostgreSQL already stores stage/scene JSON, so this additive change should not require a table migration. A document/DSL schema version bump and migration/default handling are still required.

If dashboard filtering by subject/grade later needs server-side scale, add indexed derived columns or a metadata index then. Do not prematurely duplicate canonical JSON data in Phase 1.

Whole-lesson duplication is not exposed as a first-class storage operation. Implement it as a transactional clone of Stage + ordered Scenes + outline + references, generating new IDs while retaining source assets by reference where ownership permits.

### Provider and media architecture

LLM calls flow through shared `callLLM`/`streamLLM` utilities and a provider registry. Image, video, TTS, ASR, web search, extraction, and assets have their own abstractions. This satisfies the provider-neutral requirement and must remain the only integration path.

New server routes must resolve provider configuration using existing server utilities. No API key may be persisted in lesson metadata, returned to the browser, logged, or embedded in exports. The classic application's existing client-configured-key header flow is legacy behavior to preserve carefully, not a pattern to expand.

### Performance

OpenMAIC already provides the necessary primitives for honest progress:

- streamed outlines;
- scene-level parallel generation;
- progressive preview/persistence;
- parallel media orchestration;
- retries at scene and asset boundaries;
- lazy/runtime media paths;
- asset caching;
- server generation jobs and status APIs.

Phase 2 should map real pipeline events to teacher language (“Planning lesson”, “Creating explanations”, “Preparing visuals”, “Building activities”) and mark completion only from actual events. Essential text/slide structure should become teachable before optional images, TTS, or advanced interactives finish. Cache keys must include the teacher request, relevant material versions, provider/model, and prompt/schema version.

### Security

Existing protections worth retaining include server-side provider configuration, SSRF URL validation, MIME/size normalization, asset indirection, storage validators, and iframe sandboxing. Generated interactive HTML is rendered with `allow-scripts allow-forms allow-popups` while intentionally omitting `allow-same-origin`, which limits its access to the parent origin.

Risks to close during implementation:

1. Common V1 activities and simulations must never execute generated JavaScript; use native validated data renderers.
2. Generated/imported content should be sanitized and validated at every write and render boundary. The `/api/classroom` path sanitizes slide prose, but generation/preview and alternate import/update routes must be verified for equivalent coverage before trusting them.
3. Uploaded material text is untrusted data, not instruction. Teacher-assistant and generation prompts must delimit it and defend against prompt injection.
4. Assistant mutations must be allowlisted, validated, previewed, and teacher-confirmed.
5. External embeds require an allowlist, restrictive sandbox/CSP, visible origin, and an offline fallback.
6. Exported HTML/resource packs require the same content policy as in-app rendering.

## What should be reused, modified, hidden, and left alone

### Reuse directly

- `MaicDocument`, Stage/Scene ordering, storage adapters, folders, and asset references;
- outline/scene generation orchestration and streaming;
- provider registries and LLM/media/TTS/ASR/search adapters;
- canvas renderer, slide editor, playback engine, iframe pool, and scene renderers;
- document upload/extraction and material bundling;
- quiz data/rendering primitives;
- course editing tools and scene patch services;
- PPTX, HTML/ZIP, script, and video export pipelines;
- localization, branding configuration, logging, usage tracking, and error utilities.

### Modify additively

- teacher request, lesson metadata, teacher-support metadata, and generation prompts;
- interactive content to support trusted native activity/simulation configs alongside legacy HTML;
- playback chrome for smart-board mode;
- quiz presentation mode;
- assistant persona, output schema, and teacher confirmation flow;
- dashboard/library actions, including duplicate and teach-again;
- real generation progress labels;
- tests for new schemas, navigation, touch/pointer behavior, malformed model output, and persistence.

### Hide from the primary V1 journey

- Pro workbench/session complexity;
- multi-agent persona selection and learner roundtable UI;
- PBL creation and learner task-engine modes;
- student profiles, student response histories, and learner grading UX;
- raw interactive-HTML and provider toggles;
- advanced TTS/voice/video settings.

These systems should remain reachable through an advanced/legacy entry point or feature flag while teacher routes mature. Do not delete them.

### Leave untouched unless a dependency requires change

- package-specific renderer/editor/importer internals;
- existing export formats;
- provider implementations;
- PBL runtime and APIs;
- multi-agent internals unrelated to teacher-assistant context;
- publication, folder, ownership, and asset backends.

## Proposed teacher-first architecture

Use an additive route and module boundary:

```text
app/(teacher)/
  page.tsx                         teacher dashboard
  lessons/new/page.tsx             structured lesson request
  lessons/[id]/edit/page.tsx       review/edit adapter over current editor
  lessons/[id]/teach/page.tsx      smart-board shell over PlaybackEngine

lib/teacher/
  lesson-request.ts                schema + requirement compiler
  lesson-metadata.ts               versioned Stage/Scene teacher fields
  generation-adapter.ts            existing generation orchestration adapter
  activity-registry.ts             schema/renderer lookup
  simulation-registry.ts           schema/renderer lookup
  assistant-context.ts             bounded current-lesson context
  assistant-actions.ts             allowlisted, confirmable mutations
  presentation-state.ts            ephemeral reveal/score/annotation state
```

Route naming can follow existing conventions during implementation, but the dependency direction is important: teacher UI depends on OpenMAIC services and packages; core packages do not depend on teacher React screens.

Feature flags should allow the existing OpenMAIC entry points to remain available during the transition and make upstream rebases safer. Once the teacher shell is complete, `/` can become the teacher dashboard while the legacy/workbench experience remains under an advanced route.

## Database and migration implications

V1 can avoid a structural database migration because canonical stage and scene data are JSON-backed in both persistence modes. Required work is nevertheless migration-sensitive:

- add optional fields first so old documents remain readable;
- version teacher metadata and native activity/simulation configs independently;
- update DSL/app validators, JSON schemas, export/import, and package versions together;
- add fixtures for old documents, teacher documents, malformed activity data, and future unknown versions;
- preserve unknown optional fields when documents round-trip through old/new services where practical;
- verify IndexedDB and PostgreSQL parity for create, update, duplicate, list, delete, and reopen;
- keep presentation-only state out of the canonical lesson unless the teacher explicitly saves it.

No V1 tables for students, classes, joins, responses, leaderboards, analytics, or homework should be created. Future V2 can attach those aggregates to stable lesson/stage and scene IDs.

## Principal risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Student-centric prompt assumptions | Verbose narration and wrong classroom role | Introduce one canonical teacher request/context passed to every generation step; add snapshot/schema tests. |
| Large existing page components | Slow, fragile UI changes | Build a small teacher route group and extract service adapters, not a new generation core. |
| Two persistence modes | Divergent save/reopen behavior | Contract tests against browser and server document stores for every metadata/activity change. |
| Generated HTML | Security and inconsistent activities | Native registry for common activities/simulations; sandbox legacy HTML. |
| Whiteboard terminology mismatch | Replacing useful functionality or missing pen UX | Keep AI whiteboard; implement annotations as a separate overlay. |
| DSL evolution | Broken imports/exports/upstream compatibility | Optional versioned fields, schema fixtures, package-version discipline, and migration tests. |
| Smart-board hardware variance | Poor touch precision/performance | Pointer-event tests plus manual resolution/touch matrix; minimum target sizes and reduced-motion support. |
| Baseline test instability on Windows | Regressions hidden in noise | Canonical Linux CI, known-failure ledger, targeted new-feature suites, and Windows portability follow-up. |
| Fullscreen/browser restrictions | Teacher cannot enter/exit reliably | User-gesture fullscreen, visible fallback, retained browser controls, and deterministic exit handling. |
| Provider latency/cost | Teacher waits in class | Essential-first streaming, lazy optional assets, cancel/retry, caching, and honest progress. |

## Exact implementation plan

### Phase 1 — Teacher product shell

1. Add a teacher route group, layout, navigation, and brand tokens without changing core generation.
2. Build the dashboard from existing stage-list/search/folder APIs: Create Lesson, Recent Lessons, Saved Lessons, Continue Editing, Teach Again.
3. Build the six-field Create Lesson form and reuse the existing upload/extraction control behind a simplified presentation.
4. Compile the structured form into the current free-form requirement so generation remains operational before Phase 2 schema changes.
5. Add a feature flag/legacy route for the current home/workbench entry points.
6. Test navigation, validation, accessibility, recent lesson loading, upload handoff, and the unchanged generation launch.

Recommended Phase 1 boundaries: new teacher routes/components, a thin stage-list adapter, a lesson-form schema, and brand/navigation configuration. Do not change DSL scene types, persistence tables, prompts, playback internals, or activity rendering in Phase 1.

### Phase 2 — Teacher lesson generation

1. Add versioned teacher lesson metadata and `TeacherLessonRequest` validation.
2. Adapt outline/content/action prompts to human-led teaching and duration-aware pedagogical selection.
3. Pass the teacher contract and cited materials through every generation step.
4. Add typed teacher-support output and strict validation/fallbacks.
5. Expose real generation progress from existing stream/job events.
6. Add the Grade 8 Chemistry / Structure of the Atom / 40 minutes / Balanced fixture and tests.

### Phase 3 — Smart-board presentation

1. Add Teach Now route/shell over the existing playback engine and scene renderers.
2. Implement large touch navigation, scene indicator, fullscreen handling, answer reveal/reset, notes drawer, and responsive board layouts.
3. Add a low-latency teacher annotation overlay with pen, eraser, clear, undo/redo, and optional shapes/text.
4. Keep annotations and reveal state ephemeral by default.
5. Add pointer, keyboard, fullscreen fallback, navigation, and resolution tests.

### Phase 4 — Activity engine

1. Extend interactive content additively for native, versioned component configs.
2. Implement the registry and six schemas/renderers: multiple choice, True/False, matching, drag-and-drop, wheel, and team scoring.
3. Reuse quiz primitives where they fit; do not duplicate grading math.
4. Add malformed-output, bounds, accessibility, reset, scoring, and persistence tests.

### Phase 5 — Live AI assistant

1. Build one teacher persona over existing context/evidence and provider systems.
2. Define concise response and allowlisted action schemas.
3. Add Show Now, Insert into Lesson, Create Activity, and Create Question confirmation flows.
4. Add difficulty/type quick-question presets and scene/material context tests.
5. Verify prompt-injection boundaries and provider-neutral behavior.

### Phase 6 — Interactive components

1. Add the versioned simulation registry sharing native interactive infrastructure.
2. Implement two or three high-value components, recommended: Atom Builder, Number Line, and Fraction Visualizer.
3. Add reset/challenge/config schemas, accessibility, and offline behavior.
4. Keep PhET optional and outside the critical path.

### Phase 7 — Polish

1. Add whole-lesson duplication and finish library/save/reopen flows.
2. Profile generation, board rendering, annotation latency, and asset loading.
3. Improve error recovery, cancellation, retry, accessibility, reduced motion, and board responsiveness.
4. Run the full regression matrix in canonical Linux CI and supported local environments.
5. Document deployment, provider configuration, migrations, security boundaries, and V2 extension seams.

## Phase 1 recommendation

Proceed with a **thin teacher product shell** and keep existing generation running exactly as it does now. The first implementation milestone should prove that a teacher can reach a clean dashboard, enter structured lesson details, attach materials through existing ingestion, and launch the existing generator. This validates the product journey without coupling UI work to the larger prompt/DSL changes reserved for Phase 2.

Phase 1 should not yet add smart-board playback, native activities, assistant mutations, database tables, student concepts, or Excalidraw/PhET dependencies.

## Representative files inspected

This audit examined the repository inventory and traced the primary implementations rather than relying on README claims. Representative paths include:

### Project and documentation

- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `next.config.ts`
- `tsconfig.json`
- `vitest.config.ts`
- `playwright.config.ts`

### Routes and product entry points

- `app/page.tsx`
- `app/generation-preview/page.tsx`
- `app/classroom/[id]/page.tsx`
- `app/workspace/page.tsx`
- `app/workbench/new/page.tsx`
- `app/api/classroom/route.ts`
- `app/api/generate-classroom/route.ts`
- `app/api/generate/scene-outlines-stream/route.ts`
- `app/api/generate/scene-content/route.ts`
- `app/api/generate/scene-actions/route.ts`
- `app/api/chat/pi/route.ts`
- `app/api/extract-document/route.ts`
- `app/api/quiz-grade/route.ts`
- `app/api/persistence/[...path]/route.ts`

### Models, generation, and providers

- `packages/@openmaic/dsl/src/types/stage.ts`
- `packages/@openmaic/dsl/src/types/scene.ts`
- `packages/@openmaic/dsl/src/schema/scene.ts`
- `packages/@openmaic/generation/src/index.ts`
- `lib/generation/scene-outline-prompt.ts`
- `lib/generation/scene-content-generator.ts`
- `lib/generation/user-requirements.ts`
- `lib/ai/llm.ts`
- `lib/ai/providers.ts`
- `lib/server/provider-config.ts`
- `lib/server/generation/classroom-job.ts`

### Playback, rendering, editing, and whiteboard

- `components/stage/playback-chrome-root.tsx`
- `components/stage/playback-engine.tsx`
- `components/stage/canvas-area.tsx`
- `components/stage/canvas-toolbar.tsx`
- `components/stage/slide-canvas.tsx`
- `components/stage/quiz-view.tsx`
- `components/stage/interactive-view.tsx`
- `components/whiteboard/whiteboard-canvas.tsx`
- `components/roundtable/index.tsx`
- `packages/@openmaic/renderer/src/index.ts`
- `packages/@openmaic/editor/src/react/index.ts`

### Agents, materials, storage, and exports

- `lib/chat/pi/tools/read-scene.ts`
- `lib/chat/pi/tools/call-agent.ts`
- `lib/server/agent-runtime/course-tools.ts`
- `lib/server/agent-runtime/material-tools.ts`
- `lib/document/extractors/registry.ts`
- `lib/document/extractors/media-registry.ts`
- `lib/storage/document-store.ts`
- `lib/storage/database.ts`
- `packages/@openmaic/storage/src/index.ts`
- `lib/export/pptx.ts`
- `lib/export/classroom-zip.ts`
- `lib/export/script.ts`
- `lib/video-export/`

The repository contains 3,123 tracked files and 1,057 tracked files classified by path/name as test-related. The audit also searched the complete route, component, library, package, schema, persistence, export, and test inventories for the requested capabilities.

## Phase 0 exit decision

Phase 0 is sound enough to proceed. The foundation should be adapted, not rewritten. The branch is ready for a logically separate Phase 1 change once authorized. The known upstream test baseline and build warnings must remain visible throughout development.
