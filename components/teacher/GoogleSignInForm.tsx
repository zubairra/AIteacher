'use client';

import { signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authNetworkError, parseAuthApiResponse } from '@/lib/auth/api-contract';
import { createGoogleAuthProvider, getFirebaseClient } from '@/lib/firebase/client';

export function GoogleSignInForm({ next = '/learn' }: { next?: string }) {
  const router = useRouter();
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function signIn() {
    if (pending) return;
    if (role === 'student' && !ageConfirmed) {
      setError(
        'Confirm you are 13 or older. OrbitTeach does not open accounts for younger learners.',
      );
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const { auth } = getFirebaseClient();
      const credential = await signInWithPopup(auth, createGoogleAuthProvider());
      const response = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: await credential.user.getIdToken(),
          role,
          ageConfirmed: role === 'student' ? ageConfirmed : false,
        }),
      });
      const result = await parseAuthApiResponse(response);
      if (!response.ok || !result.ok) {
        await auth.signOut();
        setError(result.ok ? 'Unable to sign in right now. Please try again.' : result.message);
        return;
      }
      if (result.notice) {
        setNotice(result.notice);
        return;
      }
      router.replace(result.role === 'student' ? next : '/');
      router.refresh();
    } catch (cause) {
      const code = typeof cause === 'object' && cause && 'code' in cause ? String(cause.code) : '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError(authNetworkError().message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/40">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">OrbitTeach</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">Welcome back</h1>
        <p className="mt-2 text-slate-600">
          Students get a personal tutor. Teachers keep their lesson workspace. Use Google to
          continue.
        </p>
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-slate-800">I am joining as</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                ['teacher', 'Teacher'],
                ['student', 'Student'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold ${
                  role === value
                    ? 'border-blue-700 bg-blue-50 text-blue-800'
                    : 'border-slate-200 text-slate-700'
                }`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {role === 'student' ? (
          <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={ageConfirmed}
              onChange={(event) => setAgeConfirmed(event.target.checked)}
            />
            <span>I am 13 or older. OrbitTeach does not create accounts for younger learners.</span>
          </label>
        ) : null}
        {error ? (
          <p className="mt-6 text-sm font-medium text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-6 text-sm font-medium text-slate-700" role="status">
            {notice}{' '}
            <a
              className="font-semibold text-blue-700 underline"
              href={notice.includes('stays a student') ? next : '/'}
            >
              Continue
            </a>
          </p>
        ) : null}
        <button
          type="button"
          className="mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={pending || (role === 'student' && !ageConfirmed)}
          onClick={() => void signIn()}
        >
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-full bg-blue-700 text-sm font-bold text-white"
          >
            G
          </span>
          {pending ? 'Connecting…' : 'Continue with Google'}
        </button>
      </section>
    </main>
  );
}
