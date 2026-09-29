import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function adminCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  return projectId && clientEmail && privateKey
    ? cert({ projectId, clientEmail, privateKey })
    : applicationDefault();
}

export function firebaseAdminApp() {
  return (
    getApps()[0] ??
    initializeApp({
      credential: adminCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID?.trim(),
    })
  );
}

export const firebaseAdminAuth = () => getAuth(firebaseAdminApp());
export const firebaseAdminDb = () => getFirestore(firebaseAdminApp());
