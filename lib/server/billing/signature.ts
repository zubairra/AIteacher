import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Razorpay signs the raw body with HMAC-SHA256 and sends the hex digest. */
export function razorpaySignatureMatches(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(signature.trim());
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function webhookEventId(header: string | null, rawBody: string): string {
  const trimmed = header?.trim() ?? '';
  if (/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) return trimmed;
  return createHash('sha256').update(rawBody).digest('hex');
}
