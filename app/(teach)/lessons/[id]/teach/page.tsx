'use client';

import { useParams } from 'next/navigation';
import { ClassroomSurface } from '@/components/classroom/ClassroomSurface';

export default function TeacherLessonTeachPage() {
  const params = useParams<{ id: string }>();
  return <ClassroomSurface classroomId={params.id} variant="page" teachMode />;
}
