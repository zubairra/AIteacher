import type { StageListItem } from '@/lib/utils/stage-storage';
import { parseTeacherLessonMetadata } from './lesson-request';

export interface TeacherLessonListItem {
  id: string;
  title: string;
  subject?: string;
  grade?: string;
  topic?: string;
  updatedAt: number;
  sceneCount: number;
  isTeacherLesson: boolean;
}

export function toTeacherLessonListItem(stage: StageListItem): TeacherLessonListItem {
  const metadata = parseTeacherLessonMetadata(stage.teacherLesson);
  return {
    id: stage.id,
    title: stage.name,
    subject: metadata?.subject,
    grade: metadata?.grade,
    topic: metadata?.topic,
    updatedAt: stage.updatedAt,
    sceneCount: stage.sceneCount,
    isTeacherLesson: metadata !== undefined,
  };
}
