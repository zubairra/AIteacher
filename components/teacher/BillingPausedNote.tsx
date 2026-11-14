import Link from 'next/link';

/** Shown instead of prices when billing is turned off. */
export function BillingPausedNote({ title = 'Plans' }: { title?: string }) {
  return (
    <section
      data-testid="billing-free-note"
      className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
        {title}
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Free for now</h1>
      <p className="mt-4 text-base leading-7 text-slate-700 dark:text-slate-300">
        Lessons are free while SmartBoard AI earns your trust. Plans, chalks, top-ups, and school
        billing are turned off. You can generate lessons without a subscription.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-violet-700 px-6 text-base font-semibold text-white"
      >
        Back to the dashboard
      </Link>
    </section>
  );
}
