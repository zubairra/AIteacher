import { describe, expect, test } from 'vitest';

import { isSameOriginMutation } from '@/lib/server/auth/request-security';

function request(url: string, headers: Record<string, string>) {
  return new Request(url, { method: 'POST', headers });
}

describe('same-origin mutation check', () => {
  test('accepts a browser on 127.0.0.1 when Next reports localhost', () => {
    expect(
      isSameOriginMutation(
        request('http://localhost:3010/api/auth/sign-in', {
          origin: 'http://127.0.0.1:3010',
          host: '127.0.0.1:3010',
        }),
      ),
    ).toBe(true);
  });

  test('rejects a cross-site origin even if it spoofs forwarded host', () => {
    expect(
      isSameOriginMutation(
        request('http://localhost:3010/api/auth/sign-in', {
          origin: 'https://evil.example',
          host: 'localhost:3010',
          'x-forwarded-host': 'evil.example',
        }),
      ),
    ).toBe(false);
  });
});
