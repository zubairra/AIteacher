'use client';

import { useState } from 'react';
import { Lightbulb, MessageCircleQuestion, NotebookPen, TriangleAlert, X } from 'lucide-react';
import type { TeacherNotes } from '@/lib/teacher/lesson-request';

const entries = [
  ['teacherTip', 'Teacher tip', Lightbulb],
  ['commonMisconception', 'Common misconception', TriangleAlert],
  ['discussionPrompt', 'Discussion prompt', MessageCircleQuestion],
  ['explanationNote', 'Explanation note', NotebookPen],
] as const;

export function TeacherNotesPanel({ notes }: { notes?: TeacherNotes }) {
  const [open, setOpen] = useState(false);
  if (!notes) return null;
  const visible = entries.filter(([key]) => notes[key]);
  if (visible.length === 0) return null;

  return (
    <div className="absolute right-4 top-16 z-50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-950 shadow-md hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
      >
        <NotebookPen className="size-4" aria-hidden="true" />
        Teacher Notes
      </button>
      {open ? (
        <aside
          className="mt-2 max-h-[calc(100vh-8rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          aria-label="Teacher notes"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Teacher Notes</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close teacher notes"
              className="grid size-9 place-items-center rounded-lg hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-600 dark:hover:bg-slate-800"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-3">
            {visible.map(([key, label, Icon]) => (
              <section key={key} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-200">
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  {notes[key]}
                </p>
              </section>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
