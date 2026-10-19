'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listLiveResults } from '@/lib/teacher/live-session-client';
import type { LiveResultRecord } from '@/lib/teacher/live-session';

export function LiveResultsList({ lessonId }: { lessonId: string }) {
  const [results, setResults] = useState<LiveResultRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listLiveResults(lessonId)
      .then((items) => {
        if (!cancelled) setResults(items);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load class results.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">Class results</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Saved live sessions</h1>
      <div className="mt-4 flex gap-4 text-sm font-semibold">
        <Link href={`/lessons/${lessonId}/edit`} className="text-violet-700 underline">
          Back to lesson
        </Link>
        <Link href={`/lessons/${lessonId}/teach`} className="text-violet-700 underline">
          Teach
        </Link>
      </div>
      {error ? (
        <p role="alert" className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-amber-950">
          {error}
        </p>
      ) : null}
      {results && results.length === 0 ? (
        <p className="mt-8 text-slate-600">
          No class results yet. Start a live class from Teach Mode, then end it to save the tally.
        </p>
      ) : null}
      <div className="mt-6 grid gap-4">
        {results?.map((result) => (
          <article key={result.code} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-mono text-2xl font-bold tracking-[0.2em]">{result.code}</h2>
              <p className="text-sm text-slate-500">
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(result.closedAt))}
              </p>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {result.sceneTitle} · {result.responseCount}{' '}
              {result.responseCount === 1 ? 'student' : 'students'}
            </p>
            <div className="mt-4 grid gap-4">
              {result.prompts.map((prompt) => {
                const graded = prompt.responseCount - prompt.ungradedCount;
                const tally = prompt.tally ?? [];
                const writings = result.students.filter(
                  (student) => student.promptId === prompt.id && student.text,
                );
                return (
                  <section key={prompt.id}>
                    <h3 className="font-semibold">{prompt.prompt}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {prompt.ungradedCount > 0 && graded === 0
                        ? `${prompt.responseCount} written ${prompt.responseCount === 1 ? 'answer' : 'answers'}`
                        : `${prompt.correctCount} correct of ${graded} graded`}
                      {prompt.ungradedCount > 0 && graded > 0
                        ? ` · ${prompt.ungradedCount} written`
                        : ''}
                    </p>
                    {tally.length > 0 && (tally.length > 1 || tally[0]?.id !== 'submitted') ? (
                      <ul className="mt-2 grid gap-1 text-sm text-slate-700">
                        {tally.map((row) => (
                          <li key={row.id} className="flex justify-between gap-3">
                            <span>{row.label}</span>
                            <span className="font-semibold tabular-nums">{row.count}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {writings.length ? (
                      <ul className="mt-2 grid gap-1 text-sm">
                        {writings.map((student) => (
                          <li key={`${student.displayName}-${student.text}`}>
                            <span className="font-semibold">{student.displayName}: </span>
                            {student.text}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
