import { apiError } from '@/lib/server/api-response';
import { isSessionId } from '@/lib/student/nav';
import { studentStore } from '@/lib/server/student/firestore-store';
import { isUser, requireStudentRequest } from '@/lib/server/student/http';
import { toPublicMessage } from '@/lib/server/student/tutor-turn';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireStudentRequest(request, false);
  if (!isUser(user)) return user;
  const { id } = await context.params;
  if (!isSessionId(id)) return apiError('INVALID_REQUEST', 404, 'That conversation was not found.');
  const store = studentStore();
  const session = await store.getSession(user.id, id);
  if (!session) return apiError('INVALID_REQUEST', 404, 'That conversation was not found.');
  const messages = await store.listMessages(user.id, id);
  return Response.json(
    {
      success: true,
      session: {
        id: session.id,
        grantId: session.grantId,
        title: session.title,
        mode: session.mode,
        updatedAt: session.updatedAt,
      },
      messages: messages.map(toPublicMessage),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
