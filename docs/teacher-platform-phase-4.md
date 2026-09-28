# Teacher Platform Phase 4 — Revision and Activity Engine

Phase 4 adds trusted, data-driven whole-class activities to teacher lessons. It does not add student devices, networking, subject simulators, or the Phase 5 live assistant.

## Architecture

`Scene.nativeActivity` is optional additive metadata on the existing Scene aggregate. Definitions use version 1 and one of seven types: `multiple-choice`, `true-false`, `match-pairs`, `sort`, `ordering`, `spin-wheel`, or `team-battle`. No new Scene type, database, playback engine, or executable model output was introduced.

`nativeActivitySchema` enforces bounded content, unique IDs, answer/category/order references, minimum collections, gamification settings, and reward rules. The document write boundary rejects invalid definitions. Teach Mode validates again and displays a safe return surface for malformed or unsupported data.

The central `activityRegistry` maps each type to one trusted React renderer and capability metadata. `NativeActivitySurface` resolves it; `ActivityHost` owns title, instructions, reset, and Return to Lesson. Renderers own gameplay only.

## Activities

- Multiple Choice: 2–6 options, explicit check, explanation, next, reset, and summary.
- True / False: shared teacher-paced question runtime with two large controls.
- Match Pairs: randomized tap-to-match; incorrect attempts preserve progress.
- Sort: pointer/tap selection into validated categories.
- Ordering: shared item movement with accessible up/down controls and checking.
- Spin Wheel: unbiased selection, keep/remove/spin again, reset, and reduced motion.
- Team Battle: team names, oral questions, reveal, manual award/correction, skip/next, streaks, power-up controls, and results.

## Runtime and persistence

Only validated definitions persist with the Scene. Selections, matches, placements, wheel changes, timers, scores, streaks, inventory, reward cards, and team state are ephemeral React state. Activity and annotation state are independent.

Teach Mode shows Activity only for a valid current-scene definition. Opening it preserves scene ID, fullscreen, annotations, and navigation. Review adds title/type/count preview and a persisted Remove Activity action using the existing Stage store.

## Gamification

Reusable deterministic logic provides bounded score calculation, streaks, inventories, reward rules, tiers, summaries, and 50/50. Power-ups are 50/50, Double Points, Safe Bet, Second Chance, Extra Time, Hint, and Score Boost. Optional question data includes difficulty, base points, and a safe hint; AI cannot award rewards.

Validated reward rules trigger from gameplay and award a bounded power-up or bonus. Default streak rules create teacher-dismissible reward cards. Quizzes support shared Class state or isolated Team A/Team B state. Team Battle maintains separate scores, streaks, and teacher-adjustable power-ups.

Scoring applies base points, second-attempt reduction, approved multipliers, and a configured cap. Incorrect answers score zero; Safe Bet never removes prior points. Session summaries contain score, correct count, best streak, and accuracy without persistent student analytics.

## Generation and security

Teacher-led prompt context describes the data-only vocabulary, pedagogical uses, style differences, and duration restraint. The existing outline pipeline carries optional `nativeActivity` into the existing scene builder. Legacy generation gets no teacher activity context.

Native activities never evaluate JavaScript, JSX, event handlers, HTML, or expressions. Existing interactive HTML remains on its separate sandboxed legacy path.

## Adding an activity

Add a bounded schema variant, extend the type union, implement one renderer, register it once, declare supported power-ups, and add tests. No Teach Mode switch or migration is required.

## Testing and limitations

Tests cover all schemas, malformed data, registry completeness, five subject/topic families, randomization, activity mechanics, scoring, streaks, inventory, rewards, generation context, and browser launch/return. Physical smart-board hardware remains unverified. Gameplay is session-only. Review intentionally is not a full game designer.

## Phase 5 extension points

- Context: `useStageStore` Stage, scenes, and `currentSceneId`.
- Construct/validate: `NativeActivityDefinition` and `parseNativeActivity`.
- Immediate launch: `NativeActivitySurface` via `TeacherTeachMode` state.
- Confirmed replace/insert: `updateScene(sceneId, { nativeActivity })`.
- Quick questions: multiple-choice/true-false definitions using the same runtime.
