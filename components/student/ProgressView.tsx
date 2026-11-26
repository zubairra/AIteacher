import { lessonPath } from '@/lib/student/nav';
import type { ProgressViewModel } from '@/lib/student/progress';

export function ProgressView({ progress }: { progress: ProgressViewModel }) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          These numbers come from conversations and scored answers saved on your account. Nothing
          here is estimated.
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Lessons opened" value={String(progress.lessonsOpened)} />
        <Card
          label="Lessons completed"
          value={String(progress.lessonsCompleted)}
          detail="Finished exams"
        />
        <Card label="Topics practised" value={String(progress.topicsPractised)} />
        <Card
          label="Quiz performance"
          value={
            progress.quizPercent === null
              ? 'No scores yet'
              : `${progress.quizCorrect}/${progress.quizAttempted}`
          }
        />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Streak</h2>
        {progress.showStreak ? (
          <p className="mt-2 text-slate-800">
            {progress.streak} day{progress.streak === 1 ? '' : 's'} in a row, counting UTC days with
            a saved turn or score.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            No current streak. A streak starts when you practise on consecutive days.
          </p>
        )}
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <TopicList
          title="Strengths"
          items={progress.strengths}
          empty="Strengths appear after at least two correct scored answers on a topic."
        />
        <TopicList
          title="Weak areas"
          items={progress.weak}
          empty="Weak areas appear after a few scored questions where misses outnumber correct answers."
        />
      </section>
      <section>
        <h2 className="text-lg font-semibold">Recent activity</h2>
        {progress.recent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {progress.recent.map((item) => (
              <li key={`${item.at}-${item.label}`}>
                <a
                  href={lessonPath(item.grantId)}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 text-sm"
                >
                  <span>{item.label}</span>
                  <time
                    className="shrink-0 text-slate-500"
                    dateTime={new Date(item.at).toISOString()}
                  >
                    {new Date(item.at).toLocaleString()}
                  </time>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </article>
  );
}

function TopicList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-800">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
