import { describe, expect, test } from 'vitest';

import { parseAuthApiResponse } from '@/lib/auth/api-contract';

describe('auth client response parsing', () => {
  test('accepts the JSON success contract', async () => {
    const result = await parseAuthApiResponse(
      Response.json({ ok: true, user: { id: 'a', name: 'A', email: 'a@example.test' } }),
    );
    expect(result.ok).toBe(true);
  });

  test.each([
    ['empty response', new Response(null, { status: 500 })],
    [
      'HTML response',
      new Response('<html>error</html>', { status: 500, headers: { 'content-type': 'text/html' } }),
    ],
    [
      'malformed JSON',
      new Response('{', { status: 500, headers: { 'content-type': 'application/json' } }),
    ],
  ])('turns %s into a stable UI error', async (_name, response) => {
    await expect(parseAuthApiResponse(response)).resolves.toEqual({
      ok: false,
      code: 'AUTH_INVALID_RESPONSE',
      message: 'Unable to sign in right now. Please try again.',
    });
  });

  test('preserves a valid server error contract', async () => {
    const result = await parseAuthApiResponse(
      Response.json(
        { ok: false, code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
        { status: 401 },
      ),
    );
    expect(result).toEqual({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    });
  });
});
