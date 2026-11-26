'use client';

import { useState } from 'react';

export function ShareLessonButton({ lessonId }: { lessonId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<{ joinCode: string; path: string; title: string } | null>(
    null,
  );
  const [copied, setCopied] = useState<string | null>(null);

  async function shareLesson() {
    if (pending) return;
    setPending(true);
    setError(null);
    setCopied(null);
    try {
      const response = await fetch(`/api/teacher/lessons/${lessonId}/share`, { method: 'POST' });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        setError(body?.error || 'This lesson could not be shared.');
        return;
      }
      setShare({ joinCode: body.joinCode, path: body.path, title: body.title });
    } catch {
      setError('This lesson could not be shared.');
    } finally {
      setPending(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied(null);
      setError('Copy it from the text below.');
    }
  }

  const link =
    share && typeof window !== 'undefined' ? `${window.location.origin}${share.path}` : share?.path;

  return (
    <div className="mt-3">
      <button
        type="button"
        className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        onClick={() => void shareLesson()}
        disabled={pending}
      >
        {pending ? 'Sharing…' : 'Share with students'}
      </button>
      {error ? (
        <p className="mt-2 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {share && link ? (
        <div
          className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
          role="status"
        >
          <p className="font-semibold text-slate-900">{share.title}</p>
          <p className="mt-2 text-slate-600">
            Class code{' '}
            <span className="font-mono font-semibold tracking-widest">{share.joinCode}</span>
          </p>
          <p className="mt-1 break-all text-slate-600">{link}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="min-h-10 text-xs font-semibold text-blue-800"
              onClick={() => void copy(share.joinCode, 'code')}
            >
              {copied === 'code' ? 'Code copied' : 'Copy code'}
            </button>
            <button
              type="button"
              className="min-h-10 text-xs font-semibold text-blue-800"
              onClick={() => void copy(link, 'link')}
            >
              {copied === 'link' ? 'Link copied' : 'Copy link'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
