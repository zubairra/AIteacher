import { describe, expect, it } from 'vitest';
import { toTeacherLessonListItem } from '@/lib/teacher/lesson-list';
import type { StageListItem } from '@/lib/utils/stage-storage';

const common: StageListItem = {
  id: 'stage-1',
  name: 'Structure of the Atom',
  sceneCount: 8,
  createdAt: 1,
  updatedAt: 2,
};

describe('teacher dashboard mapping', () => {
  it('maps teacher metadata into teacher-friendly lesson fields', () => {
    expect(
      toTeacherLessonListItem({
        ...common,
        teacherLesson: {
          version: 1,
          mode: 'teacher-led',
          subject: 'Chemistry',
          grade: 'Grade 8',
          topic: 'Structure of the Atom',
          durationMinutes: 40,
          curriculum: 'CBSE',
          teachingStyle: 'balanced',
        },
      }),
    ).toMatchObject({ subject: 'Chemistry', grade: 'Grade 8', isTeacherLesson: true });
  });

  it('keeps legacy OpenMAIC lessons usable when metadata is absent', () => {
    expect(toTeacherLessonListItem(common)).toEqual({
      id: 'stage-1',
      title: 'Structure of the Atom',
      subject: undefined,
      grade: undefined,
      topic: undefined,
      updatedAt: 2,
      sceneCount: 8,
      isTeacherLesson: false,
    });
  });
});
