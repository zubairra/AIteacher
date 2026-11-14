import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement('a', { ...props, href }, children),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: () => undefined, refresh: () => undefined }),
}));

import { BillingPausedNote } from '@/components/teacher/BillingPausedNote';
import { TeacherDashboard } from '@/components/teacher/TeacherDashboard';
import { TeacherShell, visibleTeacherNav } from '@/components/teacher/TeacherShell';
import type { TeacherBillingView } from '@/lib/teacher/billing';

const view = {
  phase: 'expired',
  headline: 'Out of chalks',
  detail: 'Upgrade or top up 100 chalks for ₹399.',
  chalksLabel: 'Out of chalks',
} as TeacherBillingView;

function shell(billingEnabled: boolean, chalkLabel: string | null = null) {
  return renderToStaticMarkup(
    // TeacherShell lists children in its props, so createElement expects it there.
    // eslint-disable-next-line react/no-children-prop
    createElement(TeacherShell, {
      teacherName: 'Teacher A',
      teacherEmail: 'a@example.test',
      chalkLabel,
      billingEnabled,
      children: 'Lessons',
    }),
  );
}

describe('pricing UI while billing is off', () => {
  it('keeps the lesson and whiteboard links and hides plans', () => {
    const labels = visibleTeacherNav(false).map((item) => item.label);
    expect(labels).toEqual([
      'Dashboard',
      'Create Lesson',
      'Saved Lessons',
      'Whiteboard',
      'Settings',
    ]);
    expect(visibleTeacherNav(true).map((item) => item.label)).toEqual([
      'Dashboard',
      'Create Lesson',
      'Saved Lessons',
      'Whiteboard',
      'Plans',
      'School',
      'Settings',
    ]);

    const hidden = shell(false, '3 chalks left');
    expect(hidden).toContain('Whiteboard');
    expect(hidden).toContain('Create Lesson');
    expect(hidden).not.toContain('Plans');
    expect(hidden).not.toContain('School');
    expect(hidden).not.toContain('chalk-balance');
    expect(hidden).not.toContain('3 chalks left');

    const shown = shell(true, '3 chalks left');
    expect(shown).toContain('Plans');
    expect(shown).toContain('School');
    expect(shown).toContain('data-testid="chalk-balance"');
    expect(shown).toContain('3 chalks left');
  });

  it('hides the trial banner even if a billing view is passed', () => {
    const hidden = renderToStaticMarkup(
      createElement(TeacherDashboard, { billing: view, billingEnabled: false }),
    );
    const shown = renderToStaticMarkup(
      createElement(TeacherDashboard, { billing: view, billingEnabled: true }),
    );
    expect(hidden).not.toContain('trial-banner');
    expect(hidden).not.toContain('Out of chalks');
    expect(hidden).not.toContain('Upgrade');
    expect(shown).toContain('data-testid="trial-banner"');
  });

  it('shows a free note with no prices on the plans and school pages', () => {
    const plans = renderToStaticMarkup(createElement(BillingPausedNote, null));
    const school = renderToStaticMarkup(createElement(BillingPausedNote, { title: 'School' }));
    for (const markup of [plans, school]) {
      const text = markup.replace(/<[^>]+>/g, ' ');
      expect(markup).toContain('data-testid="billing-free-note"');
      expect(text).toContain('Free for now');
      expect(text).not.toMatch(/₹|Upgrade|Top up|chalks left|\bPro\b|\bMax\b/);
    }
    expect(school).toContain('School');
  });
});
