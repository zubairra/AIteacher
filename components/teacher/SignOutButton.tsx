'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { getFirebaseClient } from '@/lib/firebase/client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      onClick={async () => {
        await fetch('/api/auth/sign-out', { method: 'POST' });
        await getFirebaseClient().auth.signOut();
        router.replace('/sign-in');
        router.refresh();
      }}
      aria-label="Sign out"
    >
      <LogOut className="size-4" aria-hidden="true" />
      <span className="hidden lg:inline">Sign out</span>
    </button>
  );
}
