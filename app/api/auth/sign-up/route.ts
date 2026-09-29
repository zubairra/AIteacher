import { authError } from '@/lib/server/auth/api-response';

export const runtime = 'nodejs';

export async function POST() {
  return authError('INVALID_REQUEST', 410, 'Use Continue with Google to sign in.');
}
