export const STUDENT_NAV = [
  { href: '/learn', label: 'Home' },
  { href: '/learn/progress', label: 'Progress' },
  { href: '/learn/profile', label: 'Profile' },
] as const;

export function lessonPath(grantId: string): string {
  return `/learn/lessons/${encodeURIComponent(grantId)}`;
}

export function sharePath(token: string): string {
  return `/learn/share/${encodeURIComponent(token)}`;
}

/** Only in-app student paths. Blocks protocol-relative and off-site redirects. */
export function safeStudentNext(value: string | undefined): string {
  if (!value) return '/learn';
  if (!value.startsWith('/learn')) return '/learn';
  if (value.startsWith('//') || value.includes('\\') || value.includes('://')) return '/learn';
  if (value.includes('\r') || value.includes('\n')) return '/learn';
  return value;
}

export function isSafeDocId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function isGrantId(value: string): boolean {
  return /^[a-f0-9]{32}$/.test(value);
}

export function isSessionId(value: string): boolean {
  return /^ses_[A-Za-z0-9_-]{8,32}$/.test(value);
}

export function isClientMessageId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

export function isShareToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,40}$/.test(value);
}

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeJoinCode(value: string): string | null {
  const compact = value.replace(/[\s-]+/g, '').toUpperCase();
  if (compact.length !== 6) return null;
  if ([...compact].some((char) => !JOIN_CODE_ALPHABET.includes(char))) return null;
  return compact;
}
