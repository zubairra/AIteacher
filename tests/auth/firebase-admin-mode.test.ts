import { afterEach, describe, expect, test } from 'vitest';

import { firebaseAdminAuthMode } from '@/lib/server/firebase/admin';

const KEYS = [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
] as const;

const previous = new Map<string, string | undefined>();

describe('Firebase Admin credential selection', () => {
  afterEach(() => {
    for (const key of KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
  });

  function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
    for (const key of KEYS) {
      if (!previous.has(key)) previous.set(key, process.env[key]);
      const next = values[key];
      if (next === undefined) delete process.env[key];
      else process.env[key] = next;
    }
  }

  test('uses the emulator project without a service account', () => {
    setEnv({
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_PROJECT_ID: 'demo-smartboard',
      FIREBASE_CLIENT_EMAIL: 'ignored@example.test',
      FIREBASE_PRIVATE_KEY: 'ignored',
    });
    expect(firebaseAdminAuthMode()).toBe('emulator');
  });

  test('uses a service account when emulators are off and the key is complete', () => {
    setEnv({
      FIREBASE_PROJECT_ID: 'smartboard-ai',
      FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk@smartboard-ai.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    });
    expect(firebaseAdminAuthMode()).toBe('service-account');
  });

  test('uses application default credentials when the service account is incomplete', () => {
    setEnv({ FIREBASE_PROJECT_ID: 'smartboard-ai' });
    expect(firebaseAdminAuthMode()).toBe('application-default');
  });
});
