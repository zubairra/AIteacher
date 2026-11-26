import { createHash } from 'node:crypto';

import type { LessonGrant, StoredLesson } from '@/lib/student/turn-types';

export function grantIdFor(teacherUid: string, lessonId: string): string {
  return createHash('sha256').update(`${teacherUid}\n${lessonId}`).digest('hex').slice(0, 32);
}

export function grantFromLesson(input: {
  studentUid: string;
  teacherUid: string;
  lessonId: string;
  lesson: Pick<StoredLesson, 'title' | 'subject' | 'grade' | 'topic'>;
  classId: string | null;
  now: number;
}): LessonGrant {
  return {
    id: grantIdFor(input.teacherUid, input.lessonId),
    studentUid: input.studentUid,
    teacherUid: input.teacherUid,
    lessonId: input.lessonId,
    title: input.lesson.title || 'Untitled lesson',
    subject: input.lesson.subject,
    grade: input.lesson.grade,
    topic: input.lesson.topic || input.lesson.title || 'Untitled lesson',
    classId: input.classId,
    sharedAt: input.now,
  };
}
