import { PROVIDERS } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';
import { usingFirebaseEmulators } from '@/lib/server/firebase/admin';

/**
 * Server-only base URL overrides. The browser cannot supply these.
 * Qwen's public default is the DashScope compatible-mode host. Set
 * DASHSCOPE_BASE_URL only when the operator needs another host, such as
 * DashScope's international endpoint.
 */
const SERVER_BASE_URL_ENV: Partial<Record<ProviderId, string>> = {
  qwen: 'DASHSCOPE_BASE_URL',
};

function allowLoopbackOverride(): boolean {
  return (
    usingFirebaseEmulators() ||
    process.env.ALLOW_LOCAL_NETWORKS === 'true' ||
    process.env.ALLOW_LOCAL_NETWORKS === '1'
  );
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Explicit operator override, or undefined when the provider default should be used. */
export function serverProviderBaseUrlOverride(providerId: string): string | undefined {
  const envName = SERVER_BASE_URL_ENV[providerId as ProviderId];
  if (!envName) return undefined;
  const raw = process.env[envName]?.trim();
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${envName} is not a valid URL`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${envName} must use http or https`);
  }
  if (url.hostname === 'metadata.google.internal' || url.hostname === '169.254.169.254') {
    throw new Error(`${envName} cannot target a metadata address`);
  }
  if (isLoopbackHost(url.hostname) && !allowLoopbackOverride()) {
    throw new Error(`${envName} cannot target a local address`);
  }
  return raw.replace(/\/$/, '');
}

/** Base URL the server uses for a teacher-supplied provider key. */
export function teacherProviderRequestBaseUrl(providerId: string): string {
  const override = serverProviderBaseUrlOverride(providerId);
  if (override) return override;
  const fallback = PROVIDERS[providerId as ProviderId]?.defaultBaseUrl;
  if (!fallback) throw new Error('This provider has no connection endpoint');
  return fallback.replace(/\/$/, '');
}
