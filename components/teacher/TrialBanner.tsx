import Link from 'next/link';
import { CreditCard } from 'lucide-react';

import type { TeacherBillingView } from '@/lib/teacher/billing';

export function TrialBanner({ view }: { view: TeacherBillingView }) {
  const tone =
    view.phase === 'active'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : view.phase === 'trial'
        ? 'border-amber-200 bg-amber-50 text-amber-950'
        : 'border-rose-200 bg-rose-50 text-rose-950';
  return (
    <div
      data-testid="trial-banner"
      role="status"
      className={`mb-8 flex flex-col gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${tone}`}
    >
      <div>
        <p className="text-lg font-semibold">{view.headline}</p>
        <p className="mt-1 text-sm leading-6">{view.detail}</p>
      </div>
      <Link
        href="/billing"
        className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-base font-semibold text-white"
      >
        <CreditCard className="size-4" aria-hidden="true" />
        Billing
      </Link>
    </div>
  );
}
