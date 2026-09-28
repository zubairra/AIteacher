'use client';
import { RotateCcw, X } from 'lucide-react';
import type { ReactNode } from 'react';
export function ActivityHost({
  title,
  instructions,
  onReset,
  onClose,
  children,
}: {
  title: string;
  instructions?: string;
  onReset: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className="absolute inset-0 z-[60] flex flex-col bg-slate-950 text-white"
      aria-label={`Activity: ${title}`}
      data-testid="activity-host"
    >
      <header className="flex min-h-20 items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-cyan-300">
            Class activity
          </p>
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {instructions ? (
            <p className="mt-1 max-w-4xl text-base text-slate-300">{instructions}</p>
          ) : null}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onReset} className={button}>
            <RotateCcw className="size-5" /> Reset
          </button>
          <button type="button" onClick={onClose} className={button}>
            <X className="size-5" /> Return to Lesson
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5 sm:p-8">{children}</div>
    </section>
  );
}
export const button =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 text-base font-bold hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-40';
