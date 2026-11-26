import { apiError } from '@/lib/server/api-response';
import { parseLearningProfile } from '@/lib/student/profile';
import { studentStore } from '@/lib/server/student/firestore-store';
import { isUser, requireStudentRequest } from '@/lib/server/student/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await requireStudentRequest(request, false);
  if (!isUser(user)) return user;
  const profile = await studentStore().getProfile(user.id, user.name);
  return Response.json({ success: true, profile }, { headers: { 'cache-control': 'no-store' } });
}

export async function PUT(request: Request) {
  const user = await requireStudentRequest(request, true);
  if (!isUser(user)) return user;
  const profile = parseLearningProfile(await request.json().catch(() => null));
  if (!profile) {
    return apiError(
      'INVALID_REQUEST',
      400,
      'Use your name, grade, subjects, and an optional study focus. Leave out anything else.',
    );
  }
  await studentStore().saveProfile(user.id, profile);
  return Response.json({ success: true, profile });
}
