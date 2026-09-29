import { resolveRequestOwnerId } from './owner';
import { resolveTeacherSessionRequest, teacherOwnerId } from '@/lib/server/auth/session';

/**
 * Resolve the anonymous owner identity and run a handler with its response
 * headers.
 *
 * The Set-Cookie minted by resolveRequestOwnerId must ride every response,
 * including 4xx and 5xx: a client that retries after an error keeps the same
 * owner partition, while a 500 that dropped the cookie would silently make
 * the retry a different anonymous owner.
 */
export async function withRequestOwnerId(
  req: Pick<Request, 'headers'>,
  handler: (ownerId: string, responseHeaders: Headers) => Promise<Response>,
): Promise<Response> {
  const responseHeaders = new Headers();
  const teacher = await resolveTeacherSessionRequest(req);
  const ownerId = teacher
    ? teacherOwnerId(teacher.id)
    : resolveRequestOwnerId(req, responseHeaders);
  try {
    return await handler(ownerId, responseHeaders);
  } catch (error) {
    console.error('[agent-runtime] request failed under a request owner', error);
    return new Response('Internal Server Error', { status: 500, headers: responseHeaders });
  }
}
