import Link from 'next/link';

import { TEACHER_PLAN, formatInr } from '@/lib/teacher/billing';

export function UpgradeScreen() {
  const price = formatInr(TEACHER_PLAN.pricePaise);
  return (
    <section
      data-testid="upgrade-screen"
      className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-white p-8 shadow-sm sm:p-10"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-700">
        Teacher plan
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        Your free trial has ended
      </h1>
      <p className="mt-4 text-base leading-7 text-slate-700">
        You can still sign in, open the lessons you already created, and teach them on the board.
        Generating a new lesson, and other AI requests, need an active plan.
      </p>
      <p className="mt-3 text-base leading-7 text-slate-700">
        The Teacher plan is {price} per month, billed in India through Razorpay. UPI autopay and
        cards are offered at checkout. The 15-day trial did not ask for a card.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/billing"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-violet-700 px-6 text-base font-semibold text-white"
        >
          Subscribe
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
