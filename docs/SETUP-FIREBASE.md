# SmartBoard AI Firebase setup

Project: **smartboard-ai**. Firestore region: **Mumbai**. Google sign-in is already enabled and the Web App is already registered.

The teacher app reads environment variables from **either** `.env` or `.env.local` in the repository root. `pnpm dev` and `pnpm start` load both with no extra flag. When the same name is set in both files, `.env.local` wins. Both files are gitignored (`.env*` in `.gitignore`). This checkout uses **`.env`**. Keep using that file. Do not create a second file unless you want it to override `.env`.

Docker Compose injects `.env` and then `.env.local` into the container when those files exist. A missing file is skipped. Public `NEXT_PUBLIC_FIREBASE_*` values are compiled into the browser when Next starts, so a Compose image only sees them if they were present at image build time. Local SmartBoard setup is `pnpm dev` with the `.env` file described here.

A provider API key, including Qwen/DashScope, is **not** an environment variable. After you sign in, paste it on the Settings page. The server encrypts it and the browser only receives a masked status.

## Variables already in `.env`

These are already set and should stay:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_USE_EMULATORS`
- `FIREBASE_PROJECT_ID`

For real Google sign-in, `NEXT_PUBLIC_FIREBASE_USE_EMULATORS` must be `0` or unset. `1` sends the browser to the local emulators instead of smartboard-ai. `FIREBASE_PROJECT_ID` should be `smartboard-ai`.

## Variables you still need to add to `.env`

Add these three to the same `.env` file. Restart `pnpm dev` after saving.

| Name                            | Where the value comes from          |
| ------------------------------- | ----------------------------------- |
| `FIREBASE_CLIENT_EMAIL`         | Service account JSON `client_email` |
| `FIREBASE_PRIVATE_KEY`          | Service account JSON `private_key`  |
| `APP_CREDENTIAL_ENCRYPTION_KEY` | Generated on your machine (below)   |

Optional, only if Qwen should use a host other than the default DashScope compatible-mode URL:

- `DASHSCOPE_BASE_URL` — leave unset to use `https://dashscope.aliyuncs.com/compatible-mode/v1`. The international host is `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.

Do not set `FIREBASE_AUTH_EMULATOR_HOST` or `FIRESTORE_EMULATOR_HOST` for real sign-in. `pnpm test:firebase-emulator` sets them itself.

`DATABASE_URL` is not used for teacher sign-in or teacher lessons. Leave it unset unless you are running the separate OpenMAIC workbench.

## Create the Firebase Admin service account

1. Open the [Firebase console](https://console.firebase.google.com/) and select **smartboard-ai**.
2. Choose the gear icon, then **Project settings**.
3. Open the **Service accounts** tab.
4. Click **Generate new private key** and confirm. A JSON file downloads. Keep that file on this machine only. Do not commit it and do not paste it into chat.
5. Copy the fields into `.env`:

```bash
FIREBASE_PROJECT_ID=smartboard-ai
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@smartboard-ai.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

- `project_id` is `FIREBASE_PROJECT_ID` (you already have this).
- `client_email` is `FIREBASE_CLIENT_EMAIL`.
- `private_key` is `FIREBASE_PRIVATE_KEY`. Keep the double quotes. The JSON value already contains `\n` for line breaks. Pasting it inside quotes is what Next.js expects. The server also accepts a value where those `\n` sequences are still literal.

The Admin SDK uses this key on the server. It is not a `NEXT_PUBLIC_` variable.

## Generate the credential encryption key

Teacher provider keys are encrypted with AES-256-GCM before they are written to Firestore. Generate a 32-byte key locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put the single line of output in `.env`:

```bash
APP_CREDENTIAL_ENCRYPTION_KEY=the-base64-output
```

`openssl rand -base64 32` is the same 32 bytes if you copy the one line it prints and do not add a line break in the middle. Do not rotate this value after teachers have saved keys unless you are prepared for those saved keys to stop decrypting.

## Deploy Firestore rules

From the repository root, after `npx firebase-tools login`:

```bash
npx firebase-tools deploy --only firestore:rules --project smartboard-ai
```

`firebase.json` already points at `firestore.rules`. The rules let a signed-in teacher read and write only `users/{their uid}` and their lessons. Settings and provider credentials are denied to the browser. The server writes those with the Admin SDK.

## Authorized domains

In Firebase console: **Authentication → Settings → Authorized domains**.

- Add **localhost** now, if it is not already listed. Local `pnpm dev` uses it.
- Add the App Hosting domain later, when that hostname exists. Use the exact hostname shown for the smartboard-ai web app (no path, no `https://`).

Google sign-in fails with an unauthorized-domain error until the hostname you open in the browser is on this list.

## What the app does with this configuration

- **Continue with Google** signs in with Firebase Auth and `POST /api/auth/sign-in` turns the ID token into an HTTP-only session cookie named `smartboard_firebase_session`.
- Sign out clears that cookie and the Firebase client user. Signing in again with the same Google account restores the same teacher.
- With `NEXT_PUBLIC_FIREBASE_PROJECT_ID` set, lesson list, create, review, edit, and Teach Mode read and write Firestore at `users/{uid}/lessons/{lessonId}`. They do not use browser-local lesson storage.
- Edit and delete are allowed only for that uid. Another teacher opening the lesson URL loads their own empty path. Firestore rules reject a direct read, update, or delete of someone else's lesson.
- Settings saves a provider key encrypted in `users/{uid}/providerCredentials/{providerId}`. The browser receives `maskedSuffix` (last four characters) and `verificationStatus` only. **Test connection** runs a short provider request with the saved or just-typed key and updates that status. The key survives sign-out and a server restart because it lives in Firestore, not in the Next.js process.

Email/password sign-up is not a teacher login. `POST /api/auth/sign-up` answers 410, and `/sign-up` redirects to `/sign-in`. There is no PostgreSQL teacher-account table to configure.

## Manual test with your Google account and a real Qwen key

1. Confirm `.env` contains the three missing variables above, `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=0`, and `FIREBASE_PROJECT_ID=smartboard-ai`.
2. Restart the app: `pnpm dev`.
3. Open `http://localhost:3000`. Choose **Continue with Google** and sign in.
4. Sign out, then sign in with the same Google account. The same teacher name should return.
5. Open **Settings**. Choose **Qwen**, paste your DashScope key (it starts with the DashScope key prefix, not a value from this file), choose a model such as Qwen3.7 Plus, click **Test connection**, then **Save securely**. The page should show a masked key ending in the last four characters and status `verified`. The full key should not appear.
6. Sign out and sign in again. Settings should still show the masked key.
7. Create a lesson: Subject **Mathematics**, Grade **Grade 8**, Topic **Factorisation**. Generate it, review the editor, then open Teach Mode.
8. Create a second lesson: Subject **Geography**, Grade **Grade 6**, Topic **Volcanoes**. Generate it and open Teach Mode.
9. If you have a second Google account, sign in as that teacher. Saved lessons should be empty, and opening the first teacher's `/lessons/{id}/edit` or `/lessons/{id}/teach` URL should not show the lesson.

## Emulator check (no real Google account)

This repository includes a one-command emulator run. It needs Java and Google Chrome. It does not use your service account or a real provider key.

```bash
pnpm test:firebase-emulator
```

That command starts the Auth emulator on port 9099 and the Firestore emulator on port 8080, runs the Firestore rules tests, then drives the teacher UI: sign in, create a lesson, reload, sign out and in, block a second teacher, save a fake Qwen key against a local mock provider, restart Next.js, and confirm the masked status is still there.
