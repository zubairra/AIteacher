import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type AppOptions,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function usingFirebaseEmulators(): boolean {
  return Boolean(
    process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim() || process.env.FIRESTORE_EMULATOR_HOST?.trim(),
  );
}

function configuredProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    undefined
  );
}

export type FirebaseAdminAuthMode = 'emulator' | 'service-account' | 'application-default';

/** How this process will authenticate the Admin SDK. Emulators never use a service account. */
export function firebaseAdminAuthMode(): FirebaseAdminAuthMode {
  if (usingFirebaseEmulators()) return 'emulator';
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  return projectId && clientEmail && privateKey ? 'service-account' : 'application-default';
}

export function firebaseAdminInitOptions(): AppOptions {
  const mode = firebaseAdminAuthMode();
  if (mode === 'emulator') {
    return { projectId: configuredProjectId() || 'demo-smartboard' };
  }
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (mode === 'service-account') {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!.trim();
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n').trim();
    return {
      credential: cert({ projectId: projectId!, clientEmail, privateKey }),
      projectId,
    };
  }
  return { credential: applicationDefault(), projectId };
}

export function firebaseAdminApp() {
  return getApps()[0] ?? initializeApp(firebaseAdminInitOptions());
}

export const firebaseAdminAuth = () => getAuth(firebaseAdminApp());
export const firebaseAdminDb = () => getFirestore(firebaseAdminApp());
