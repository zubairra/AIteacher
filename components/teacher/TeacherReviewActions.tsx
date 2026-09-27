'use client';

import { Play } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function TeacherReviewActions({ lessonId }: { readonly lessonId: string }) {
  const router = useRouter();

  return (
    <div className="absolute right-4 top-4 z-[60]">
      <button
        type="button"
        onClick={() => router.push(`/lessons/${encodeURIComponent(lessonId)}/teach`)}
        className="flex min-h-12 items-center gap-2 rounded-xl bg-violet-600 px-5 text-base font-semibold text-white shadow-lg transition-colors hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
      >
        <Play className="size-5 fill-current" aria-hidden="true" />
        Teach Now
      </button>
    </div>
  );
}
