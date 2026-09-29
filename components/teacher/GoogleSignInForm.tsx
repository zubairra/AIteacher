'use client';

import { signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authNetworkError, parseAuthApiResponse } from '@/lib/auth/api-contract';
import { createGoogleAuthProvider, getFirebaseClient } from '@/lib/firebase/client';

export function GoogleSignInForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { auth } = getFirebaseClient();
      const credential = await signInWithPopup(auth, createGoogleAuthProvider());
      const response = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: await credential.user.getIdToken() }),
      });
      const result = await parseAuthApiResponse(response);
      if (!response.ok || !result.ok) {
        await auth.signOut();
        setError(result.ok ? 'Unable to sign in right now. Please try again.' : result.message);
        return;
      }
      router.replace('/');
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
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/40">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-violet-600">
          SmartBoard AI
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">Welcome back</h1>
        <p className="mt-2 text-slate-600">
          Use your Google account to open your private teacher workspace on any device.
        </p>
        {error ? (
          <p className="mt-6 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={pending}
          onClick={() => void signIn()}
        >
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white"
          >
            G
          </span>
          {pending ? 'Connecting…' : 'Continue with Google'}
        </button>
      </section>
    </main>
  );
}
