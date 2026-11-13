import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

import { AUTH_STATE, FAKE_QWEN_KEY, MASKED_SUFFIX } from './firebase-teacher-helpers';

test.use({ storageState: AUTH_STATE });

test('masked Qwen status survives a server restart', async ({ page }) => {
  const expected = JSON.parse(readFileSync('e2e/.auth/expectations.json', 'utf8')) as {
    maskedSuffix: string;
  };
  expect(expected.maskedSuffix).toBe(MASKED_SUFFIX);

  await page.goto('/settings');
  await expect(page.getByText(MASKED_SUFFIX).first()).toBeVisible();
  await expect(page.getByText('verified').first()).toBeVisible();

  const body = await page.evaluate(async () => {
    const response = await fetch('/api/teacher/providers', { cache: 'no-store' });
    return { status: response.status, text: await response.text() };
  });
  expect(body.status).toBe(200);
  expect(body.text).toContain(MASKED_SUFFIX);
  expect(body.text).toContain('verified');
  expect(body.text).not.toContain(FAKE_QWEN_KEY);
  expect(body.text).not.toContain('ciphertext');
});
