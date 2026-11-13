import Link from 'next/link';

import { CHALK_PLANS, formatInr } from '@/lib/teacher/billing';
import { ChalkIcon } from './ChalkIcon';

export function UpgradeScreen() {
  const topUp = formatInr(CHALK_PLANS.topUp.pricePaise);
  return (
    <section
      data-testid="upgrade-screen"
      className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-white p-8 shadow-sm sm:p-10"
    >
      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-rose-700">
        <ChalkIcon className="size-4" />
        Out of chalks
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Out of chalks</h1>
      <p className="mt-4 text-base leading-7 text-slate-700">
        One chalk makes one new AI lesson. You can still sign in, open the lessons you already
        created, and teach them on the board.
      </p>
      <p className="mt-3 text-base leading-7 text-slate-700">
        Upgrade to Pro or Max, or top up {CHALK_PLANS.topUp.chalks} chalks for {topUp}. Top-up
        chalks stay until you use them.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/billing"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-violet-700 px-6 text-base font-semibold text-white"
        >
          Upgrade
        </Link>
        <Link
          href="/billing#top-up"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-6 text-base font-semibold"
        >
          Top up
        </Link>
        <Link
          href="/lessons"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-6 text-base font-semibold"
        >
          Back to saved lessons
        </Link>
      </div>
    </section>
  );
}
