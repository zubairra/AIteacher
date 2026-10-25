import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

import {
  AUTH_STATE,
  FAKE_QWEN_KEY,
  firebaseIdToken,
  installGenerationMocks,
  LESSON_TITLE,
  MASKED_SUFFIX,
  shot,
  signInWithGoogle,
} from './firebase-teacher-helpers';

test('teacher cloud sign-in, lessons, and provider keys', async ({ page }) => {
  await installGenerationMocks(page);
  await signInWithGoogle(page, 'teacher-a@example.test', 'Teacher A');
  await expect(page.getByText('Teacher A').first()).toBeVisible();

  await page.getByRole('link', { name: 'Create Lesson' }).first().click();
  await page.getByLabel('Subject').selectOption('Mathematics');
  await page.getByLabel('Grade').selectOption('Grade 8');
  await page.getByLabel('Topic').fill('Factorisation');
  await page.getByRole('button', { name: 'Generate Lesson' }).click();
  await page.waitForURL(/\/lessons\/[^/]+\/edit$/, { timeout: 90_000 });
  const lessonId = page.url().match(/\/lessons\/([^/]+)\/edit$/)?.[1];
  expect(lessonId).toBeTruthy();

  await page.goto('/lessons');
  await expect(page.getByRole('heading', { name: LESSON_TITLE })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: LESSON_TITLE })).toBeVisible();
  const created = await firebaseIdToken(page);
  const stored = await page.evaluate(
    async ({ uid, lesson, token }) => {
      const url = `http://127.0.0.1:8080/v1/projects/demo-smartboard/databases/(default)/documents/users/${uid}/lessons/${lesson}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      return { status: response.status, text: await response.text() };
    },
    { uid: created.uid, lesson: lessonId, token: created.token },
  );
  expect(stored.status).toBe(200);
  expect(stored.text).toContain(LESSON_TITLE);
  await shot(page, '01-teacher-a-lesson');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/sign-in$/);
  await signInWithGoogle(page, 'teacher-a@example.test', 'Teacher A');
  await page.goto('/lessons');
  await expect(page.getByRole('heading', { name: LESSON_TITLE })).toBeVisible();

  const session = await page.evaluate(async () => {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    return response.json() as Promise<{ user?: { id?: string } }>;
  });
  const teacherAUid = session.user?.id;
  expect(teacherAUid).toBeTruthy();

  await page.goto('/settings');
  const qwen = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Qwen' }) });
  await qwen.getByRole('button', { name: 'Add API Key' }).click();
  await page.getByLabel('API key').fill(FAKE_QWEN_KEY);
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await expect(page.getByText('Connection successful')).toBeVisible();
  await page.getByRole('button', { name: 'Save securely' }).click();
  await expect(qwen).toContainText(MASKED_SUFFIX);
  await qwen.getByRole('button', { name: 'Test Qwen connection' }).click();
  await expect(qwen).toContainText('verified');
  await shot(page, '02-qwen-masked');

  const providers = await page.evaluate(async () => {
    const response = await fetch('/api/teacher/providers', { cache: 'no-store' });
    return response.text();
  });
  expect(providers).toContain(MASKED_SUFFIX);
  expect(providers).toContain('verified');
  expect(providers).not.toContain(FAKE_QWEN_KEY);
  expect(providers).not.toContain('ciphertext');

  const teacherA = await firebaseIdToken(page);

  const browser = page.context().browser();
  if (!browser) throw new Error('Browser is not available');
  const teacherBContext = await browser.newContext();
  const teacherB = await teacherBContext.newPage();
  await signInWithGoogle(teacherB, 'teacher-b@example.test', 'Teacher B');
  await teacherB.goto('/lessons');
  await expect(teacherB.getByText('No lessons yet.')).toBeVisible();
  await expect(teacherB.getByRole('heading', { name: LESSON_TITLE })).toHaveCount(0);
  await shot(teacherB, '03-teacher-b-empty');

  await teacherB.goto(`/lessons/${lessonId}/edit`);
  await expect(teacherB.getByText(/Course not found|找不到这门课程/)).toBeVisible();
  await shot(teacherB, '04-teacher-b-edit-denied');
  await teacherB.goto(`/lessons/${lessonId}/teach`);
  await expect(teacherB.getByText(/Course not found|找不到这门课程/)).toBeVisible();

  const teacherBProviders = await teacherB.evaluate(async () => {
    const response = await fetch('/api/teacher/providers', { cache: 'no-store' });
    return { status: response.status, text: await response.text() };
  });
  expect(teacherBProviders.status).toBe(200);
  expect(teacherBProviders.text).not.toContain(MASKED_SUFFIX);
  expect(teacherBProviders.text).not.toContain(FAKE_QWEN_KEY);

  const teacherBAuth = await firebaseIdToken(teacherB);
  const denied = await teacherB.evaluate(
    async ({ uid, lesson, token }) => {
      const url = `http://127.0.0.1:8080/v1/projects/demo-smartboard/databases/(default)/documents/users/${uid}/lessons/${lesson}`;
      const headers = { Authorization: `Bearer ${token}` };
      const read = await fetch(url, { headers });
      const update = await fetch(url, {
        method: 'PATCH',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ fields: { ownerUid: { stringValue: uid } } }),
      });
      const remove = await fetch(url, { method: 'DELETE', headers });
      return { read: read.status, update: update.status, remove: remove.status };
    },
    { uid: teacherAUid, lesson: lessonId, token: teacherBAuth.token },
  );
  expect(denied.read).toBe(403);
  expect(denied.update).toBe(403);
  expect(denied.remove).toBe(403);

  await page.goto('/lessons');
  await expect(page.getByRole('heading', { name: LESSON_TITLE })).toBeVisible();
  await teacherBContext.close();

  await mkdir('e2e/.auth', { recursive: true });
  await page.context().storageState({ path: AUTH_STATE });
  await writeFile(
    'e2e/.auth/expectations.json',
    JSON.stringify({ maskedSuffix: MASKED_SUFFIX, lessonTitle: LESSON_TITLE, uid: teacherA.uid }),
  );
});
