import type { SceneOutline } from '../../lib/types/generation';
import { test, expect } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const teachOutlines: SceneOutline[] = [
  {
    id: 'teach-outline-1',
    type: 'slide',
    title: 'Atomic structure',
    description: 'Introduce the nucleus and electron shells.',
    keyPoints: ['Nucleus', 'Protons and neutrons', 'Electrons'],
    order: 1,
    teacherNotes: {
      version: 1,
      teacherTip: 'Ask students what they think is inside an atom.',
      commonMisconception: 'Electrons are not inside the nucleus.',
    },
  },
  {
    id: 'teach-outline-2',
    type: 'slide',
    title: 'Particle charges',
    description: 'Compare the charges of subatomic particles.',
    keyPoints: ['Positive proton', 'Neutral neutron', 'Negative electron'],
    order: 2,
  },
];

test.describe('Smart-board Teach Mode', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page, mockApi }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('maic:account:settings-storage', settings);
    }, createSettingsStorage());
    await mockApi.mockSceneOutlinesStream(teachOutlines);
    await mockApi.mockSceneContent();
    await mockApi.mockSceneActions();
  });

  test('teaches a saved lesson with navigation, annotations, notes, fullscreen, and safe exit', async ({
    page,
  }) => {
    await page.goto('/lessons/new');
    await page.getByLabel('Subject').selectOption('Chemistry');
    await page.getByLabel('Grade').selectOption('Grade 8');
    await page.getByLabel('Topic').fill('Structure of the Atom');
    await page.getByLabel('Duration').selectOption('40');
    await page.getByLabel('Curriculum').selectOption('CBSE');
    await page.getByLabel('Balanced').check();
    await page.getByRole('button', { name: 'Generate Lesson' }).click();

    await page.waitForURL(/\/lessons\/[^/]+\/edit$/, { timeout: 90_000 });
    await expect(page.getByRole('link', { name: 'Teach Now' })).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/lessons\/[^/]+\/teach$/, { timeout: 15_000 }),
      page.getByRole('link', { name: 'Teach Now' }).click(),
    ]);
    await expect(page.getByTestId('teacher-teach-mode')).toBeVisible();

    for (const size of [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 3840, height: 2160 },
    ]) {
      await page.setViewportSize(size);
      const toolbarBox = await page.getByTestId('teacher-teach-toolbar').boundingBox();
      expect(toolbarBox?.width).toBeLessThanOrEqual(size.width);
      expect(toolbarBox?.y).toBeGreaterThanOrEqual(0);
      expect((toolbarBox?.y ?? 0) + (toolbarBox?.height ?? 0)).toBeLessThanOrEqual(size.height);
    }
    await page.setViewportSize({ width: 1366, height: 768 });

    const previous = page.getByRole('button', { name: 'Previous scene' });
    const next = page.getByRole('button', { name: 'Next scene' });
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await expect(page.getByLabel('Lesson position')).toHaveText('1 / 2');
    await next.click();
    await expect(page.getByLabel('Lesson position')).toHaveText('2 / 2');
    await expect(next).toBeDisabled();
    await previous.click();
    await expect(page.getByLabel('Lesson position')).toHaveText('1 / 2');

    const draw = page.getByRole('button', { name: 'Draw' });
    const overlay = page.getByTestId('teacher-annotation-overlay');
    await draw.click();
    await expect(draw).toHaveAttribute('aria-pressed', 'true');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 12 });
      await page.mouse.up();
    }
    await expect(page.getByRole('button', { name: 'Undo annotation' })).toBeEnabled();
    await draw.click();
    await expect(overlay).toHaveClass(/pointer-events-none/);

    await page.getByRole('button', { name: 'Notes' }).click();
    await expect(page.getByRole('complementary', { name: 'Teacher notes' })).toContainText(
      'Ask students what they think is inside an atom.',
    );
    await page.getByRole('button', { name: 'Close teacher notes' }).click();
    await expect(page.getByRole('complementary', { name: 'Teacher notes' })).toHaveCount(0);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Clear annotations' }).click();
    await expect(page.getByRole('button', { name: 'Clear annotations' })).toBeDisabled();

    await page.getByRole('button', { name: 'Enter fullscreen' }).click();
    const fullscreenActive = await page.evaluate(() => document.fullscreenElement !== null);
    if (fullscreenActive) {
      await page.getByRole('button', { name: 'Exit fullscreen' }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    } else {
      await expect(page.getByRole('status')).toContainText('Teach Mode remains active');
    }

    await page.reload();
    await expect(page.getByTestId('teacher-teach-mode')).toBeVisible();
    await page.getByRole('button', { name: 'Exit Teaching' }).click();
    await expect(page).toHaveURL(/\/lessons\/[^/]+\/edit$/);
    await expect(page.locator('[data-testid="edit-dock-bar"]')).toBeVisible();
  });
});
