import { test, expect } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

test.describe('Teacher lesson flow', () => {
  test.setTimeout(120_000);
  test.beforeEach(async ({ page, mockApi }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('maic:account:settings-storage', settings);
    }, createSettingsStorage());
    await mockApi.setupGenerationMocks();
  });

  test('creates, reviews, saves, and reopens the Grade 8 Chemistry lesson', async ({ page }) => {
    let outlineRequest: Record<string, unknown> | undefined;
    page.on('request', (request) => {
      if (request.url().includes('/api/generate/scene-outlines-stream')) {
        outlineRequest = request.postDataJSON() as Record<string, unknown>;
      }
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ready for your next class?' })).toBeVisible();
    await expect(page.getByText('No lessons yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create Lesson' }).first()).toHaveAttribute(
      'href',
      '/lessons/new',
    );
    await page.goto('/lessons/new');
    await expect(page).toHaveURL(/\/lessons\/new$/);

    await page.getByLabel('Subject').selectOption('Chemistry');
    await page.getByLabel('Grade').selectOption('Grade 8');
    await page.getByLabel('Topic').fill('Structure of the Atom');
    await page.getByLabel('Duration').selectOption('40');
    await page.getByLabel('Curriculum').selectOption('CBSE');
    await page.getByLabel('Balanced').check();
    await page.getByRole('button', { name: 'Generate Lesson' }).click();

    await page.waitForURL(/\/lessons\/[^/]+\/edit$/, { timeout: 90_000 });
    await expect(page.locator('[data-testid="edit-dock-bar"]')).toBeVisible({ timeout: 15_000 });

    const requirements = outlineRequest?.requirements as Record<string, unknown> | undefined;
    expect(requirements?.generationMode).toBe('teacher-led');
    expect(requirements?.teacherLesson).toMatchObject({
      version: 1,
      mode: 'teacher-led',
      subject: 'Chemistry',
      grade: 'Grade 8',
      topic: 'Structure of the Atom',
      durationMinutes: 40,
      curriculum: 'CBSE',
      teachingStyle: 'balanced',
    });
    expect(String(requirements?.requirement)).toContain('HUMAN TEACHER');

    await page.goto('/');
    await expect(page.getByText('Chemistry')).toBeVisible();
    await expect(page.getByText('Grade 8')).toBeVisible();
    const reviewLink = page.getByRole('link', { name: 'Review' });
    await expect(reviewLink).toBeVisible();
    await reviewLink.click();
    await expect(page).toHaveURL(/\/lessons\/[^/]+\/edit$/);
  });

  test('shows inline validation and does not start generation without required fields', async ({
    page,
  }) => {
    await page.goto('/lessons/new');
    await page.getByRole('button', { name: 'Generate Lesson' }).click();
    await expect(page.getByText('Please check the highlighted lesson details.')).toBeVisible();
    await expect(page.getByText('Enter a lesson topic.')).toBeVisible();
    await expect(page).toHaveURL(/\/lessons\/new$/);
  });
});
