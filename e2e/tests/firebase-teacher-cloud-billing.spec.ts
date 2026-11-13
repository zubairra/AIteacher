import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { firebaseIdToken, signInWithGoogle } from './firebase-teacher-helpers';

const ARTIFACT_DIR = '/opt/cursor/artifacts/billing';

async function shot(page: Page, name: string) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

function emulatorDb() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Firestore emulator is required for the billing spec');
  }
  if (!getApps().length) {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'demo-smartboard' });
  }
  return getFirestore();
}

test('trial banner, billing page, and blocked generation', async ({ page }) => {
  await signInWithGoogle(page, 'teacher-billing@example.test', 'Teacher Billing');
  await expect(page.getByTestId('trial-banner')).toContainText(/days left/);
  await shot(page, '01-trial-banner');

  await page.getByRole('link', { name: 'Billing' }).first().click();
  await expect(page.getByTestId('billing-page')).toBeVisible();
  await expect(page.getByTestId('billing-status')).toHaveText('Free trial');
  await expect(page.getByTestId('subscribe-button')).toBeVisible();
  await expect(page.getByTestId('billing-next-date')).not.toHaveText('Not scheduled');
  await shot(page, '02-billing-page');

  const { uid } = await firebaseIdToken(page);
  await emulatorDb()
    .doc(`users/${uid}/billing/subscription`)
    .set({ trialEndsAt: Date.now() - 60_000 }, { merge: true });

  await page.goto('/lessons/new');
  await expect(page.getByTestId('upgrade-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Lesson' })).toHaveCount(0);
  await shot(page, '03-upgrade-screen');

  const blocked = await page.request.post('/api/generate/scene-outlines-stream', {
    data: { requirements: { requirement: 'Factorisation' } },
  });
  expect(blocked.status()).toBe(402);
  const body = (await blocked.json()) as { error?: string; errorCode?: string };
  expect(body.errorCode).toBe('SUBSCRIPTION_REQUIRED');
  expect(JSON.stringify(body)).not.toMatch(/secret|key_secret/i);

  await page.goto('/lessons');
  await expect(page.getByRole('heading', { name: 'Saved lessons' })).toBeVisible();
});
