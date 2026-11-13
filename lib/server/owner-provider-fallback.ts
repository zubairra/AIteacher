import { getProvider } from '@/lib/ai/providers';
import {
  getServerProviders,
  isServerConfiguredProvider,
  resolveApiKey,
  resolveBaseUrl,
} from '@/lib/server/provider-config';

/**
 * Owner-managed OpenRouter credential for a signed-in teacher who has not
 * saved a key. The key stays on the server.
 */
export function ownerManagedProviderFallback(): {
  modelString: string;
  apiKey: string;
  baseUrl?: string;
} | null {
  if (!isServerConfiguredProvider('providers', 'openrouter')) return null;
  const apiKey = resolveApiKey('openrouter').trim();
  if (!apiKey) return null;
  const modelId =
    getServerProviders().openrouter?.models?.[0] || getProvider('openrouter')?.models[0]?.id;
  if (!modelId) return null;
  return {
    modelString: `openrouter:${modelId}`,
    apiKey,
    baseUrl: resolveBaseUrl('openrouter'),
  };
}
