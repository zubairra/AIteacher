import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';

export const FAKE_QWEN_KEY = 'sk-fake-qwen-test-A92F';
export const MASKED_SUFFIX = 'A92F';
export const LESSON_TITLE = 'Factorisation';
export const ARTIFACT_DIR = '/opt/cursor/artifacts/firebase-phase45';
export const AUTH_STATE = 'e2e/.auth/teacher-a.json';

const SLIDE_CONTENT = {
  type: 'slide',
  canvas: {
    id: 'c',
    viewportSize: 1920,
    viewportRatio: 0.5625,
    theme: { themeColors: [], fontColor: '#000', fontName: 'Arial', backgroundColor: '#fff' },
    elements: [],
  },
};

const OUTLINE = {
  id: 'outline-factorisation',
  type: 'slide',
  title: LESSON_TITLE,
  description: 'Introduce factorisation of algebraic expressions.',
  keyPoints: ['Common factors', 'Grouping', 'Check by expanding'],
  order: 0,
};

export async function shot(page: Page, name: string) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

export async function installGenerationMocks(page: Page) {
  await page.route('**/api/generate/scene-outlines-stream', async (route) => {
    const events = [
      { type: 'languageDirective', data: 'Teach in English.' },
      { type: 'courseTitle', data: LESSON_TITLE },
      { type: 'outline', data: OUTLINE },
      {
        type: 'done',
        outlines: [OUTLINE],
        languageDirective: 'Teach in English.',
        courseTitle: LESSON_TITLE,
        taskEngineMode: false,
      },
    ];
    const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      body,
    });
  });

  await page.route('**/api/generate/scene-content', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, content: SLIDE_CONTENT }),
    });
  });

  await page.route('**/api/generate/scene-actions', async (route) => {
    const payload = route.request().postDataJSON() as { stageId?: string };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        scene: {
          id: 'scene-factorisation',
          stageId: payload.stageId,
          type: 'slide',
          title: LESSON_TITLE,
          order: 0,
          content: SLIDE_CONTENT,
        },
      }),
    });
  });
}

/** Drive the Auth emulator's Google account picker. */
export async function signInWithGoogle(page: Page, email: string, displayName: string) {
  await page.goto('/sign-in');
  const popupPromise = page.waitForEvent('popup', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');

  await popup.getByText(/Sign-in with Google/i).waitFor({ timeout: 15_000 });
  const existing = popup.locator('#accounts-list').getByText(email, { exact: true });
  if (await existing.count()) {
    await existing.first().click();
  } else {
    // The new-account form is display:none until this list item is clicked.
    await popup.locator('#add-account-button').click();
    await popup.locator('#add-user').waitFor({ state: 'visible' });
    await popup.locator('#email-input').fill(email);
    await popup.locator('#display-name-input').fill(displayName);
    await popup.locator('#sign-in').click();
  }
  await page.waitForURL((url) => url.pathname === '/', { timeout: 30_000 });
}

export async function firebaseIdToken(page: Page): Promise<{ uid: string; token: string }> {
  return page.evaluate(async () => {
    const request = indexedDB.open('firebaseLocalStorageDb');
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const stored = await new Promise<
      Array<{ value?: { uid?: string; stsTokenManager?: { accessToken?: string } } }>
    >((resolve, reject) => {
      const tx = db.transaction('firebaseLocalStorage', 'readonly');
      const all = tx.objectStore('firebaseLocalStorage').getAll();
      all.onerror = () => reject(all.error);
      all.onsuccess = () => resolve(all.result);
    });
    const account = stored.find((item) => item.value?.stsTokenManager?.accessToken)?.value;
    if (!account?.uid || !account.stsTokenManager?.accessToken) {
      throw new Error('Firebase client session was not stored');
    }
    return { uid: account.uid, token: account.stsTokenManager.accessToken };
  });
}
