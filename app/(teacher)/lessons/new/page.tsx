import { CreateLessonForm } from '@/components/teacher/CreateLessonForm';

export default function CreateLessonPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">Create lesson</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">What are you teaching?</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">Give the AI a clear lesson brief. It will prepare classroom material for you to review and teach.</p>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <CreateLessonForm />
      </div>
    </div>
  );
}
