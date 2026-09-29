'use client';

import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

let app: FirebaseApp | undefined;
let emulatorConnected = false;

function firebaseOptions(): FirebaseOptions {
  const options = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!options.apiKey || !options.authDomain || !options.projectId || !options.appId)
    throw new Error('Firebase client configuration is incomplete');
  return options;
}

function clientApp() {
  return (app ??= getApps().length ? getApp() : initializeApp(firebaseOptions()));
}

function connectEmulators(auth: Auth, db: Firestore) {
  if (process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== '1' || emulatorConnected) return;
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  emulatorConnected = true;
}

export function getFirebaseClient() {
  const auth = getAuth(clientApp());
  const db = getFirestore(clientApp());
  connectEmulators(auth, db);
  return { auth, db };
}

export function createGoogleAuthProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export async function currentFirebaseUid(): Promise<string> {
  const { auth } = getFirebaseClient();
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('Sign in is required');
  return auth.currentUser.uid;
}
