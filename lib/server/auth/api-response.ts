import { createLogger } from '@/lib/logger';
import type { AuthErrorCode } from '@/lib/auth/api-contract';

const log = createLogger('Teacher Auth');

export function authError(code: AuthErrorCode, status: number, message: string): Response {
  return Response.json({ ok: false, code, message }, { status });
}

export function authServerFailure(operation: string, error: unknown): Response {
  const text = error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : '';
  const configurationError = /default credentials|firebase.*config|project id|credential/.test(
    text,
  );
  log.error(
    `Authentication ${operation} failed [code=${configurationError ? 'AUTH_CONFIGURATION_ERROR' : 'AUTH_SERVER_ERROR'}]`,
  );
  return authError(
    configurationError ? 'AUTH_CONFIGURATION_ERROR' : 'AUTH_SERVER_ERROR',
    500,
    'Unable to sign in right now. Please try again.',
  );
}
