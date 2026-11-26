'use client';

import { useState } from 'react';

import { lessonPath } from '@/lib/student/nav';

export function JoinClassForm({ initialCode = '' }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [className, setClassName] = useState<string | null>(null);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/student/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) {
        setError(body?.error || 'That code could not be used.');
        return;
      }
      setClassName(body.className);
      setLessons(body.lessons ?? []);
    } catch {
      setError('That code could not be used.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Join a class</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter the code your teacher shared. You will see the lessons in that class.
        </p>
      </header>
      <form onSubmit={(event) => void join(event)} className="space-y-3">
        <label className="block text-sm font-medium text-slate-800">
          Join code
          <input
            className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-mono tracking-widest uppercase"
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        {error ? (
          <p className="text-sm font-medium text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={pending || code.trim().length === 0}
        >
          {pending ? 'Joining…' : 'Join'}
        </button>
      </form>
      {className ? (
        <section role="status" className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="font-semibold text-green-900">Joined {className}.</p>
          {lessons.length === 0 ? (
            <p className="mt-2 text-sm text-green-900">
              Your teacher has not shared a lesson in this class yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {lessons.map((lesson) => (
                <li key={lesson.id}>
                  <a className="font-semibold text-blue-800" href={lessonPath(lesson.id)}>
                    {lesson.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
