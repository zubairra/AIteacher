'use client';

import { useParams } from 'next/navigation';
import { LiveResultsList } from '@/components/teacher/LiveResultsList';

export default function LessonResultsPage() {
  const params = useParams<{ id: string }>();
  return <LiveResultsList lessonId={params.id} />;
}
