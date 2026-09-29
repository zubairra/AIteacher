export type AuthErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'AUTH_CONFIGURATION_ERROR'
  | 'AUTH_SERVER_ERROR'
  | 'AUTH_INVALID_RESPONSE'
  | 'AUTH_NETWORK_ERROR';

export type AuthApiResponse =
  | { ok: true; user?: { id: string; name: string; email: string } }
  | { ok: false; code: AuthErrorCode; message: string };

const FALLBACK_MESSAGE = 'Unable to sign in right now. Please try again.';

/** Parse the explicit JSON auth contract without leaking browser parser errors into the UI. */
export async function parseAuthApiResponse(response: Response): Promise<AuthApiResponse> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const body = await response.text();
  if (!contentType.includes('application/json') || !body.trim()) {
    return { ok: false, code: 'AUTH_INVALID_RESPONSE', message: FALLBACK_MESSAGE };
  }

  try {
    const value = JSON.parse(body) as Partial<AuthApiResponse>;
    if (value.ok === true) return value as Extract<AuthApiResponse, { ok: true }>;
    if (value.ok === false && typeof value.code === 'string' && typeof value.message === 'string') {
      return value as Extract<AuthApiResponse, { ok: false }>;
    }
  } catch {
    // The server contract is malformed. The caller gets a stable, safe error.
  }
  return { ok: false, code: 'AUTH_INVALID_RESPONSE', message: FALLBACK_MESSAGE };
}

export function authNetworkError(): Extract<AuthApiResponse, { ok: false }> {
  return { ok: false, code: 'AUTH_NETWORK_ERROR', message: FALLBACK_MESSAGE };
}
