import { apiError } from '@/lib/server/api-response';
import { normalizeJoinCode } from '@/lib/student/nav';
import { studentStore } from '@/lib/server/student/firestore-store';
import { isUser, requireStudentRequest } from '@/lib/server/student/http';
import { joinClassroom } from '@/lib/server/student/sharing';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await requireStudentRequest(request, true);
  if (!isUser(user)) return user;
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? normalizeJoinCode(body.code) : null;
  if (!code)
    return apiError('INVALID_REQUEST', 400, 'Enter the 6-character join code from your teacher.');
  const result = await joinClassroom(studentStore(), {
    studentUid: user.id,
    code,
    now: Date.now(),
  });
  if (!result.ok) return apiError('INVALID_REQUEST', result.status, result.error);
  return Response.json({
    success: true,
    className: result.className,
    lessons: result.grants.map((grant) => ({
      id: grant.id,
      title: grant.title,
      subject: grant.subject,
      topic: grant.topic,
    })),
  });
}
