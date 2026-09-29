# SmartBoard AI Firebase architecture

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
- A single batch supports up to 500 writes; exceptionally large lessons should be chunked in a future hardening pass.

## Phase 5 integration

Phase 5 should obtain the verified teacher with `resolveTeacherSessionRequest`, resolve the configured model through `resolveTeacherProviderCredential(uid)`, validate generated native content, and persist confirmed lesson edits through the existing `DocumentStore` seam.
