# SmartBoard AI Firebase architecture

Owner setup for project `smartboard-ai`, including the variables still missing from `.env`, is in [SETUP-FIREBASE.md](./SETUP-FIREBASE.md). Next.js reads `.env` and `.env.local`.

## Roadmap status

| Phase | What the roadmap asked for                                             | What the code does now                                                                                                                                                                                                                                                                 |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Audit the OpenMAIC foundation and decide what to keep                  | Recorded in `docs/teacher-platform-audit.md`. No product behavior change. The foundation is reused.                                                                                                                                                                                    |
| 1     | Teacher shell: dashboard, create-lesson form, lesson library           | `/` is the teacher dashboard. `/lessons`, `/lessons/new`, and `/lessons/[id]/edit` exist. The old workbench stays at `/advanced`.                                                                                                                                                      |
| 2     | Teacher-led generation from subject, grade, topic, duration, and style | `TeacherLessonRequest` validates the brief and compiles it into the existing generator. Teacher mode skips roster and narration generation.                                                                                                                                            |
| 3     | Smart-board Teach Mode                                                 | `/lessons/[id]/teach` presents the existing scene renderers with large controls, fullscreen, notes, and an annotation overlay. Annotations stay on the device for the session.                                                                                                         |
| 4     | Native activities and gamification                                     | Seven validated activity types render in Teach Mode: multiple choice, true/false, match pairs, sort, ordering, spin wheel, and team battle. Scores stay in the session.                                                                                                                |
| 4.5   | Google sign-in and cloud persistence for lessons and provider keys     | This change. Google sign-in creates the HTTP-only `smartboard_firebase_session` cookie. Lessons are stored in Firestore under the signed-in uid. Provider keys, including Qwen/DashScope, are encrypted on the server. The browser receives a masked suffix and a verification status. |
| 5     | Live AI assistant during teaching                                      | Not built. The extension points in `docs/teacher-platform-phase-4.md` still apply. The assistant must read the teacher from `resolveTeacherSessionRequest` and the saved key from `resolveTeacherProviderCredential`.                                                                  |

Student accounts, join codes, and phone numbers are outside V1. They are not part of this Firebase path.

`DATABASE_URL` remains only for the optional OpenMAIC agent runtime, asset store, and HTTP document API. Teacher sign-in does not open Postgres. `POST /api/auth/sign-up` returns 410. When `NEXT_PUBLIC_FIREBASE_PROJECT_ID` is set, lesson reads and writes use `FirestoreDocumentStore`. The HTTP/Postgres document store is selected only when that project id is absent and `NEXT_PUBLIC_PERSISTENCE=1`. `instrumentation.ts` still connects to Postgres when `DATABASE_URL` is set, for those upstream features. `teacherOwnerId` prefixes a Firebase uid as `firebase:{uid}` so an optional agent-runtime row does not collide with an anonymous owner.

## Scope

Teacher identity and teacher-owned cloud data use Firebase. OpenMAIC's optional PostgreSQL persistence remains available for unrelated upstream runtime and asset features, but `DATABASE_URL` is not required for the SmartBoard teacher workflow.

## Authentication and sessions

The browser signs in with the Firebase Web SDK and Google provider. It sends the resulting Firebase ID token once to `POST /api/auth/sign-in`. The Node route verifies the token with Firebase Admin and exchanges it for a 14-day Firebase session cookie. The cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Server layouts and APIs derive the UID only from the verified cookie; browser-supplied UIDs are never trusted.

## Firestore structure

- `users/{uid}`: versioned profile metadata.
- `users/{uid}/lessons/{lessonId}`: Stage, outline, DSL version, summary fields, ownership marker, and timestamps.
- `users/{uid}/lessons/{lessonId}/scenes/{sceneId}`: one Scene per document, avoiding a single oversized lesson document.
- `users/{uid}/settings/ai`: selected provider and model; server-only.
- `users/{uid}/providerCredentials/{providerId}`: AES-256-GCM ciphertext and encryption metadata; server-only.

Binary assets are not embedded in Firestore. Existing OpenMAIC asset URLs/storage continue unchanged. Presentation annotations, scores, streaks, lifelines, fullscreen state, and activity runtime state remain ephemeral.

## Lesson persistence and migration

`FirestoreDocumentStore` implements the existing OpenMAIC `DocumentStore` interface, so Stage/Scene generation, review, editing, Teach Mode, and activity definitions continue to use the same persistence seam. The browser SDK can only access the signed-in UID path under Firestore Rules.

Pre-Firebase IndexedDB lessons are left untouched. There is no automatic claim operation: silently assigning device data to whichever Google account signs in first would be unsafe. A future explicit import/claim flow can read the legacy store with teacher confirmation.

## Provider credential security

Credential writes and reads use Firebase Admin only. The existing AES-256-GCM implementation is retained, with UID and provider ID authenticated as AAD. `APP_CREDENTIAL_ENCRYPTION_KEY` remains server-only. Settings APIs return only provider status, a four-character suffix, verification state, and timestamps. Firestore Rules deny all browser access to credential and AI settings documents.

`resolveTeacherProviderCredential(uid)` is the single decryption boundary used by model resolution. Phase 5 must reuse it.

## Firebase Console setup

1. Create or select a Firebase project.
2. In Project settings, add a Web App and copy its public Web SDK configuration into the `NEXT_PUBLIC_FIREBASE_*` variables listed below.
3. Open Authentication, choose **Get started**, enable **Google**, select a support email, and save.
4. Add every deployed hostname under Authentication → Settings → Authorized domains. Firebase normally includes `localhost`; add it if absent.
5. Open Firestore Database, create a database in Native mode, and choose the region nearest the deployment/users.
6. Install the Firebase CLI separately, authenticate it, select the project, then deploy `firestore.rules` with `firebase deploy --only firestore:rules`.
7. For a non-Google-managed server, create a least-privilege service account and supply its project ID, client email, and private key through the host's secret manager. On Google managed infrastructure, Application Default Credentials may be used instead.
8. Generate a 32-byte encryption key outside chat (for example, `openssl rand -base64 32`) and store it as `APP_CREDENTIAL_ENCRYPTION_KEY` in the server secret manager.
9. Restart/redeploy after setting variables. Do not place Admin credentials or the encryption key in `NEXT_PUBLIC_*` variables.

## Environment variables

Public Firebase Web App configuration:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_USE_EMULATORS` (optional local tests)

Server-only configuration:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `APP_CREDENTIAL_ENCRYPTION_KEY`
- `FIREBASE_AUTH_EMULATOR_HOST` (tests only)
- `FIRESTORE_EMULATOR_HOST` (tests only)

## Local development

Local `pnpm dev` can use the cloud project and Google Sign-In. For deterministic tests, run Firebase Emulator Suite with Auth and Firestore and set the emulator variables. Committed tests never require a personal Google account or production key.

## Security rules

`firestore.rules` permits a Firebase-authenticated browser to read/write only its own profile and lesson/scenes paths. AI settings and credential documents are denied to all browser clients and are accessible only through Firebase Admin, which bypasses rules in trusted server code. All other paths default to deny.

## Limitations

- Firebase Console configuration is required before live Google Sign-In can be manually verified.
- Existing device-local lessons require an explicit future import flow.
- Media migration to Firebase Storage is intentionally out of scope.
- Lesson writes are split into batches of at most 500 operations.
- Provider keys can be checked with Test connection. A saved Qwen key uses the DashScope compatible-mode host unless `DASHSCOPE_BASE_URL` is set on the server.

## Phase 5 integration

Phase 5 should obtain the verified teacher with `resolveTeacherSessionRequest`, resolve the configured model through `resolveTeacherProviderCredential(uid)`, validate generated native content, and persist confirmed lesson edits through the existing `DocumentStore` seam.
