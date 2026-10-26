import { expect, test } from '@playwright/test';

import { installGenerationMocks, shot, signInWithGoogle } from './firebase-teacher-helpers';

async function inkCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector(
      '[data-testid="teacher-whiteboard-canvas"]',
    ) as HTMLCanvasElement | null;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || canvas.width === 0) return 0;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let index = 3; index < data.length; index += 24) {
      if (data[index] > 16) count += 1;
    }
    return count;
  });
}

async function drawStroke(page: import('@playwright/test').Page) {
  const canvas = page.getByTestId('teacher-whiteboard-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Whiteboard canvas has no box');
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 12 });
  await page.mouse.up();
}

test('lesson whiteboard toggle keeps the lesson and the drawing', async ({ page }) => {
  await installGenerationMocks(page);
  await signInWithGoogle(page, 'teacher-board@example.test', 'Teacher Board');

  await page.getByRole('link', { name: 'Whiteboard' }).first().click();
  await expect(page.getByTestId('teacher-whiteboard')).toBeVisible();
  await drawStroke(page);
  await expect(page.getByTestId('teacher-whiteboard').getByRole('status')).toHaveText('Saved', {
    timeout: 15_000,
  });
  const standaloneInk = await inkCount(page);
  expect(standaloneInk).toBeGreaterThan(10);
  await page.reload();
  await expect(page.getByTestId('teacher-whiteboard')).toBeVisible();
  await expect.poll(() => inkCount(page), { timeout: 15_000 }).toBeGreaterThan(10);
  await shot(page, '05-standalone-whiteboard-reloaded');

  await page.goto('/');
  await page.getByRole('link', { name: 'Create Lesson' }).first().click();
  await page.getByLabel('Subject').selectOption('Mathematics');
  await page.getByLabel('Grade').selectOption('Grade 8');
  await page.getByLabel('Topic').fill('Factorisation');
  await page.getByRole('button', { name: 'Generate Lesson' }).click();
  await page.waitForURL(/\/lessons\/[^/]+\/edit$/, { timeout: 90_000 });
  await page.getByRole('link', { name: 'Teach Now' }).click();
  await page.waitForURL(/\/teach$/);
  const position = page.getByLabel('Lesson position');
  await expect(position).toBeVisible();
  const before = await position.innerText();

  await page.getByRole('button', { name: 'Whiteboard' }).click();
  await expect(page.getByTestId('teacher-whiteboard')).toBeVisible();
  await drawStroke(page);
  await expect(page.getByTestId('teacher-whiteboard').getByRole('status')).toHaveText('Saved', {
    timeout: 15_000,
  });
  const lessonInk = await inkCount(page);
  expect(lessonInk).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Back to lesson' }).click();
  await expect(page.getByTestId('teacher-whiteboard')).toBeHidden();
  await expect(position).toHaveText(before);

  await page.getByRole('button', { name: 'Whiteboard' }).click();
  await expect.poll(() => inkCount(page)).toBeGreaterThan(10);
  await page.reload();
  await page.getByRole('button', { name: 'Whiteboard' }).click();
  await expect.poll(() => inkCount(page), { timeout: 15_000 }).toBeGreaterThan(10);
  await expect(position).toHaveText(before);
  await shot(page, '06-lesson-whiteboard-kept');
});
