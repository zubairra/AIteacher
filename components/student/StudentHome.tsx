import { lessonPath } from '@/lib/student/nav';
import type { ProgressViewModel } from '@/lib/student/progress';
import type { LessonGrant, TutorSessionRecord } from '@/lib/student/turn-types';

export function StudentHome({
  name,
  grants,
  sessions,
  progress,
}: {
  name: string;
  grants: LessonGrant[];
  sessions: TutorSessionRecord[];
  progress: ProgressViewModel;
}) {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-orange-700">OrbitTeach</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Hello, {name}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Pick up a lesson from your teacher and ask Orbit to explain it, walk a problem, or test
          what stuck.
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Lessons opened" value={String(progress.lessonsOpened)} />
        <Stat
          label="Lessons completed"
          value={String(progress.lessonsCompleted)}
          hint="After a finished exam"
        />
        <Stat
          label="Quiz score"
          value={progress.quizPercent === null ? '—' : `${progress.quizPercent}%`}
          hint={
            progress.quizAttempted === 0
              ? 'No scored questions yet'
              : `${progress.quizCorrect} of ${progress.quizAttempted}`
          }
        />
      </section>
      <section className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Lessons from your teachers</h2>
        <a
          href="/learn/join"
          className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
        >
          Join with a code
        </a>
      </section>
      {grants.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No shared lessons yet. Ask your teacher for a class code or a share link.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {grants.map((grant) => (
            <li
              key={grant.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h3 className="text-lg font-semibold">{grant.title}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {[grant.subject, grant.grade, grant.topic].filter(Boolean).join(' · ')}
              </p>
              <a
                href={lessonPath(grant.id)}
                className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-blue-800"
              >
                Open tutor
              </a>
            </li>
          ))}
        </ul>
      )}
      <section>
        <h2 className="text-xl font-semibold">Recent conversations</h2>
        {sessions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Your tutoring history will show up here after the first reply.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {sessions.slice(0, 8).map((session) => (
              <li key={session.id}>
                <a
                  href={lessonPath(session.grantId)}
                  className="flex min-h-14 items-center justify-between px-4 text-sm"
                >
                  <span className="font-medium">{session.title}</span>
                  <span className="text-slate-500">{session.mode}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </article>
  );
}
