import { apiError } from '@/lib/server/api-response';
import { isSessionId } from '@/lib/student/nav';
import { studentStore } from '@/lib/server/student/firestore-store';
import { isUser, requireStudentRequest } from '@/lib/server/student/http';
import { gradeTutorMessage } from '@/lib/server/student/tutor-turn';
import { buildProgressView } from '@/lib/student/progress';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireStudentRequest(request, true);
  if (!isUser(user)) return user;
  const { id } = await context.params;
  if (!isSessionId(id)) return apiError('INVALID_REQUEST', 404, 'That conversation was not found.');
  const body = (await request.json().catch(() => null)) as {
    messageId?: unknown;
    answers?: unknown;
  } | null;
  if (
    !body ||
    typeof body.messageId !== 'string' ||
    !body.answers ||
    typeof body.answers !== 'object'
  ) {
    return apiError('INVALID_REQUEST', 400, 'Send the question and your answer.');
  }
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.answers)) {
    if (typeof value === 'string' && value.length <= 4_000 && /^[A-Za-z0-9_-]{1,16}$/.test(key)) {
      answers[key] = value;
    }
  }
  const result = await gradeTutorMessage(
    { store: studentStore(), now: () => Date.now() },
    { studentUid: user.id, sessionId: id, messageId: body.messageId, answers },
  );
  if (!result.ok) {
    const code = result.status === 429 ? 'RATE_LIMITED' : 'INVALID_REQUEST';
    return apiError(code, result.status, result.error);
  }
  return Response.json({
    success: true,
    message: result.message,
    progress: buildProgressView(result.stats, Date.now()),
  });
}
