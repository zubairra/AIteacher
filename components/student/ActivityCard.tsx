'use client';

import { useState } from 'react';

import type { PublicActivity, PublicSubmission } from '@/lib/student/types';

export function ActivityCard({
  activity,
  submission,
  disabled,
  onSubmit,
}: {
  activity: PublicActivity;
  submission?: PublicSubmission;
  disabled?: boolean;
  onSubmit: (answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [card, setCard] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const locked = Boolean(submission) || disabled;

  if (activity.kind === 'flashcards') {
    const item = activity.items[card];
    if (!item) return null;
    return (
      <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Flashcard</p>
        <button
          type="button"
          className="mt-3 min-h-24 w-full rounded-xl bg-white px-4 py-5 text-left text-base font-medium text-slate-900 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          onClick={() => setFlipped((value) => !value)}
        >
          {flipped ? item.back || item.prompt : item.front || item.prompt}
        </button>
        <p className="mt-2 text-xs text-slate-500">{flipped ? 'Answer' : 'Tap to flip'}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
            disabled={card === 0}
            onClick={() => {
              setCard((value) => value - 1);
              setFlipped(false);
            }}
          >
            Previous
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg px-3 text-sm font-semibold text-blue-800 disabled:opacity-40"
            disabled={card >= activity.items.length - 1}
            onClick={() => {
              setCard((value) => value + 1);
              setFlipped(false);
            }}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="mt-3 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (locked) return;
        onSubmit(answers);
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
        {activity.kind === 'mcq' ? 'Choose an answer' : 'Short answer'}
      </p>
      {activity.items.map((item, index) => {
        const result = submission?.results.find((entry) => entry.itemId === item.id);
        return (
          <fieldset key={item.id} className="space-y-2" disabled={locked}>
            <legend className="text-sm font-medium text-slate-900">
              {index + 1}. {item.prompt}
            </legend>
            {item.options ? (
              item.options.map((option) => (
                <label
                  key={option.id}
                  className="flex min-h-11 items-center gap-2 text-sm text-slate-800"
                >
                  <input
                    type="radio"
                    name={item.id}
                    value={option.id}
                    checked={answers[item.id] === option.id}
                    onChange={() => setAnswers((current) => ({ ...current, [item.id]: option.id }))}
                  />
                  {option.text}
                </label>
              ))
            ) : (
              <textarea
                className="min-h-20 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                value={answers[item.id] ?? ''}
                maxLength={4000}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [item.id]: event.target.value }))
                }
              />
            )}
            {result ? (
              <p
                className={`text-sm ${result.correct ? 'text-green-800' : 'text-slate-700'}`}
                role="status"
              >
                {result.correct === null ? 'Saved' : result.correct ? 'Correct' : 'Not yet'}.{' '}
                {result.feedback}
              </p>
            ) : null}
          </fieldset>
        );
      })}
      {submission ? (
        <p className="text-sm font-semibold text-slate-900" role="status">
          Score {submission.correct} of {submission.attempted} scored
          {submission.attempted === 0 ? ' — nothing was auto-scored' : ''}.
        </p>
      ) : (
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={locked}
        >
          Check
        </button>
      )}
    </form>
  );
}
