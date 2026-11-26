import { nanoid } from 'nanoid';

import { apiError } from '@/lib/server/api-response';
import { sharePath } from '@/lib/student/nav';
import { isSafeDocId } from '@/lib/student/nav';
import { studentStore } from '@/lib/server/student/firestore-store';
import { isUser, requireTeacherRequest } from '@/lib/server/student/http';
import { shareTeacherLesson } from '@/lib/server/student/sharing';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireTeacherRequest(request);
  if (!isUser(user)) return user;
  const { id } = await context.params;
  if (!isSafeDocId(id)) return apiError('INVALID_REQUEST', 404, 'Lesson not found.');
  const result = await shareTeacherLesson(studentStore(), {
    teacherUid: user.id,
    lessonId: id,
    now: Date.now(),
    createToken: () => nanoid(22),
  });
  if (!result.ok) return apiError('INVALID_REQUEST', result.status, result.error);
  return Response.json({
    ok: true,
    joinCode: result.joinCode,
    path: sharePath(result.token),
    title: result.title,
  });
}
