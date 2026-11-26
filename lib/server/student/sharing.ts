import { grantFromLesson } from './grants';
import type { LessonGrant, StudentStore } from '@/lib/student/turn-types';

export async function shareTeacherLesson(
  store: StudentStore,
  input: { teacherUid: string; lessonId: string; now: number; createToken: () => string },
): Promise<
  | { ok: true; joinCode: string; token: string; title: string }
  | { ok: false; status: number; error: string }
> {
  const lesson = await store.getLesson(input.teacherUid, input.lessonId);
  if (!lesson) return { ok: false, status: 404, error: 'Lesson not found.' };
  const classroom = await store.getOrCreateClassroom(input.teacherUid, input.now);
  await store.addClassLesson(
    classroom.classId,
    {
      lessonId: input.lessonId,
      title: lesson.title,
      teacherUid: input.teacherUid,
    },
    input.now,
  );
  for (const studentUid of await store.listMemberUids(classroom.classId)) {
    await store.putGrant(
      grantFromLesson({
        studentUid,
        teacherUid: input.teacherUid,
        lessonId: input.lessonId,
        lesson,
        classId: classroom.classId,
        now: input.now,
      }),
    );
  }
  const existing = await store.findShareByLesson(input.teacherUid, input.lessonId);
  const token = existing?.token ?? input.createToken();
  if (!existing) {
    await store.saveShare({
      token,
      teacherUid: input.teacherUid,
      lessonId: input.lessonId,
      createdAt: input.now,
    });
  }
  return { ok: true, joinCode: classroom.joinCode, token, title: lesson.title };
}

export async function joinClassroom(
  store: StudentStore,
  input: { studentUid: string; code: string; now: number },
): Promise<
  | { ok: true; className: string; grants: LessonGrant[] }
  | { ok: false; status: number; error: string }
> {
  const classroom = await store.lookupJoinCode(input.code);
  if (!classroom) return { ok: false, status: 404, error: 'That join code was not recognised.' };
  if (classroom.teacherUid === input.studentUid) {
    return { ok: false, status: 403, error: 'Open a student account to join a class.' };
  }
  await store.addMember(classroom.classId, input.studentUid, input.now);
  const grants: LessonGrant[] = [];
  for (const lessonRef of await store.listClassLessons(classroom.classId)) {
    if (lessonRef.teacherUid !== classroom.teacherUid) continue;
    const lesson = await store.getLesson(lessonRef.teacherUid, lessonRef.lessonId);
    const grant = grantFromLesson({
      studentUid: input.studentUid,
      teacherUid: lessonRef.teacherUid,
      lessonId: lessonRef.lessonId,
      lesson: lesson ?? {
        title: lessonRef.title,
        subject: '',
        grade: '',
        topic: lessonRef.title,
      },
      classId: classroom.classId,
      now: input.now,
    });
    await store.putGrant(grant);
    grants.push(grant);
  }
  return { ok: true, className: classroom.name, grants };
}

export async function redeemShareToken(
  store: StudentStore,
  input: { studentUid: string; token: string; now: number },
): Promise<LessonGrant | null> {
  const share = await store.getShare(input.token);
  if (!share) return null;
  if (share.teacherUid === input.studentUid) return null;
  const lesson = await store.getLesson(share.teacherUid, share.lessonId);
  if (!lesson) return null;
  const grant = grantFromLesson({
    studentUid: input.studentUid,
    teacherUid: share.teacherUid,
    lessonId: share.lessonId,
    lesson,
    classId: null,
    now: input.now,
  });
  await store.putGrant(grant);
  return grant;
}
