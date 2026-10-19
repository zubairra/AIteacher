'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Clock3, Loader2, Plus } from 'lucide-react';
import { listStages, type StageListItem } from '@/lib/utils/stage-storage';
import { toTeacherLessonListItem, type TeacherLessonListItem } from '@/lib/teacher/lesson-list';
import { Button } from '@/components/ui/button';

function formatModified(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function LessonCard({ lesson }: { lesson: TeacherLessonListItem }) {
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-violet-800">
      <div className="mb-4 flex items-start justify-between gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200">
          <BookOpen className="size-5" aria-hidden="true" />
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {lesson.sceneCount} {lesson.sceneCount === 1 ? 'section' : 'sections'}
        </span>
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{lesson.title}</h3>
      <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600 dark:text-slate-300">
        {lesson.subject ? <span>{lesson.subject}</span> : null}
        {lesson.subject && lesson.grade ? <span aria-hidden="true">•</span> : null}
        {lesson.grade ? <span>{lesson.grade}</span> : null}
      </div>
      {lesson.topic && lesson.topic !== lesson.title ? (
        <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
          {lesson.topic}
        </p>
      ) : null}
      {!lesson.isTeacherLesson ? (
        <p className="mt-2 text-xs text-slate-400">Legacy OpenMAIC lesson</p>
      ) : null}
      <div className="mt-auto flex items-end justify-between gap-3 pt-6">
        <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Clock3 className="size-3.5" aria-hidden="true" />
          {formatModified(lesson.updatedAt)}
        </p>
        <div className="flex items-center gap-1">
          {lesson.isTeacherLesson ? (
            <Link
              href={`/lessons/${lesson.id}/results`}
              className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Results
            </Link>
          ) : null}
          <Link
            href={lesson.isTeacherLesson ? `/lessons/${lesson.id}/edit` : `/classroom/${lesson.id}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 dark:text-violet-200 dark:hover:bg-violet-950/50"
          >
            {lesson.isTeacherLesson ? 'Review' : 'Open'}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function TeacherDashboard({ showAll = false }: { showAll?: boolean }) {
  const [stages, setStages] = useState<StageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listStages()
      .then((items) => {
        if (!cancelled) setStages(items);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load saved lessons.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lessons = useMemo(() => stages.map(toTeacherLessonListItem), [stages]);
  const visibleLessons = showAll ? lessons : lessons.slice(0, 6);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <section className="flex flex-col justify-between gap-6 rounded-3xl border border-violet-100 bg-white p-7 shadow-sm sm:flex-row sm:items-center lg:p-10 dark:border-violet-950 dark:bg-slate-900">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
            Teacher workspace
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {showAll ? 'Saved lessons' : 'Ready for your next class?'}
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            {showAll
              ? 'Open and continue editing lessons created in SmartBoard AI or OpenMAIC.'
              : 'Create clear, classroom-ready teaching materials while you stay in control of the lesson.'}
          </p>
        </div>
        <Button asChild size="lg" className="min-h-12 shrink-0 rounded-xl px-6 text-base">
          <Link href="/lessons/new">
            <Plus className="size-5" aria-hidden="true" />
            Create Lesson
          </Link>
        </Button>
      </section>

      <section className="mt-10" aria-labelledby="lessons-heading">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 id="lessons-heading" className="text-2xl font-semibold tracking-tight">
              {showAll ? 'All lessons' : 'Recent lessons'}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {showAll ? 'Your complete lesson library.' : 'Continue preparing where you left off.'}
            </p>
          </div>
          {!showAll && lessons.length > 6 ? (
            <Link
              href="/lessons"
              className="text-sm font-semibold text-violet-700 hover:underline dark:text-violet-200"
            >
              View all
            </Link>
          ) : null}
        </div>

        {loading ? (
          <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              Loading lessons…
            </div>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        ) : visibleLessons.length === 0 ? (
          <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <div>
              <BookOpen className="mx-auto size-10 text-slate-400" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">No lessons yet.</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Create your first AI-assisted lesson.
              </p>
              <Button asChild className="mt-5 min-h-11 rounded-xl">
                <Link href="/lessons/new">Create Lesson</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleLessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
