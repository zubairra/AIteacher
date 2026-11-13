import { z } from 'zod';

import { PROVIDERS } from '@/lib/ai/providers';
import {
  isTeacherProviderId,
  listTeacherProviderCredentials,
  resolveTeacherProviderCredential,
  setTeacherProviderVerificationStatus,
} from '@/lib/server/auth/credential-vault';
import { probeTeacherProvider } from '@/lib/server/auth/provider-probe';
import { isSameOriginMutation } from '@/lib/server/auth/request-security';
import { resolveTeacherSessionRequest } from '@/lib/server/auth/session';
import { maskCredentialSuffix } from '@/lib/server/auth/credential-crypto';

export const runtime = 'nodejs';

const schema = z.object({
  providerId: z.string().min(1).max(80),
  modelId: z.string().min(1).max(200).optional(),
  apiKey: z.string().trim().min(8).max(4096).optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request))
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const user = await resolveTeacherSessionRequest(request);
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isTeacherProviderId(parsed.data.providerId)) {
    return Response.json({ error: 'Invalid provider configuration' }, { status: 400 });
  }

  const providerId = parsed.data.providerId;
  const provider = PROVIDERS[providerId];
  let modelId = parsed.data.modelId;
  let apiKey = parsed.data.apiKey;
  let maskedSuffix: string | undefined;
  let persisted = false;

  if (apiKey) {
    modelId = modelId || provider.models[0]?.id;
    if (!modelId || !provider.models.some((model) => model.id === modelId)) {
      return Response.json({ error: 'Select a supported model' }, { status: 400 });
    }
    maskedSuffix = maskCredentialSuffix(apiKey);
  } else {
    const saved = await resolveTeacherProviderCredential(user.id, providerId, modelId);
    if (!saved) {
      return Response.json(
        { error: 'Save a provider key before testing the stored connection.' },
        { status: 404 },
      );
    }
    apiKey = saved.apiKey;
    modelId = saved.modelId;
    persisted = true;
    const metadata = (await listTeacherProviderCredentials(user.id)).find(
      (item) => item.providerId === providerId,
    );
    maskedSuffix = metadata?.maskedSuffix;
  }

  const result = await probeTeacherProvider({ providerId, modelId: modelId!, apiKey });
  const verificationStatus = result.ok ? 'verified' : 'unverified';
  if (persisted) {
    try {
      await setTeacherProviderVerificationStatus(user.id, providerId, verificationStatus);
    } catch {
      return Response.json({ error: 'Could not record the connection status' }, { status: 500 });
    }
  }

  const status = result.unsupported ? 400 : result.ok ? 200 : 502;
  return Response.json(
    {
      ok: result.ok,
      message: result.message,
      verificationStatus,
      maskedSuffix,
      persisted,
    },
    { status },
  );
}
