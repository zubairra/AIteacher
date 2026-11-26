'use client';

export default function StudentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
      <h1 className="text-lg font-semibold text-slate-950">This page could not be loaded.</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your lessons are still saved. Try again in a moment.
      </p>
      <button
        type="button"
        className="mt-4 min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
