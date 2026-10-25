export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return process.env.NODE_ENV === 'test';
  try {
    const originUrl = new URL(origin);
    // Next can report request.url as localhost while the browser is on
    // 127.0.0.1. The Host header is the host the browser actually called.
    // Do not trust x-forwarded-host here: a cross-site page can set it.
    const host = request.headers.get('host');
    if (host && originUrl.host === host) return true;
    return originUrl.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
