import { z } from 'zod';

import { PROVIDERS } from '@/lib/ai/providers';
import {
  getTeacherProviderPreference,
  isTeacherProviderId,
  listTeacherProviderCredentials,
  removeTeacherProviderCredential,
  saveTeacherProviderCredential,
  setTeacherProviderPreference,
  teacherProviderCatalog,
} from '@/lib/server/auth/credential-vault';
import { isSameOriginMutation } from '@/lib/server/auth/request-security';
import { resolveTeacherSessionRequest } from '@/lib/server/auth/session';

export const runtime = 'nodejs';

async function authenticated(request: Request) {
  return resolveTeacherSessionRequest(request);
}

export async function GET(request: Request) {
  const user = await authenticated(request);
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const [credentials, preference] = await Promise.all([
    listTeacherProviderCredentials(user.id),
    getTeacherProviderPreference(user.id),
  ]);
  return Response.json({ providers: teacherProviderCatalog(), credentials, preference });
}

const saveSchema = z.object({
  providerId: z.string().min(1).max(80),
  apiKey: z.string().trim().min(8).max(4096),
  modelId: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const user = await authenticated(request);
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isTeacherProviderId(parsed.data?.providerId ?? '')) {
    return Response.json({ error: 'Invalid provider configuration' }, { status: 400 });
  }
  const providerId = parsed.data.providerId;
  if (!isTeacherProviderId(providerId)) {
    return Response.json({ error: 'Invalid provider configuration' }, { status: 400 });
  }
  const provider = PROVIDERS[providerId];
  const modelId = parsed.data.modelId || provider.models[0]?.id;
  if (!modelId || !provider.models.some((model) => model.id === modelId)) {
    return Response.json({ error: 'Select a supported model' }, { status: 400 });
  }
  try {
    await saveTeacherProviderCredential({
      userId: user.id,
      providerId,
      apiKey: parsed.data.apiKey,
      modelId,
      verificationStatus: 'unverified',
    });
    return Response.json({ configured: true, maskedSuffix: parsed.data.apiKey.slice(-4), verificationStatus: 'unverified' });
  } catch {
    return Response.json({ error: 'Could not securely save this credential' }, { status: 500 });
  }
}

const providerSchema = z.object({ providerId: z.string().min(1).max(80) });

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const user = await authenticated(request);
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const parsed = providerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isTeacherProviderId(parsed.data.providerId)) {
    return Response.json({ error: 'Invalid provider' }, { status: 400 });
  }
  await removeTeacherProviderCredential(user.id, parsed.data.providerId);
  return Response.json({ configured: false });
}

const preferenceSchema = z.object({
  providerId: z.string().min(1).max(80),
  modelId: z.string().min(1).max(200),
});

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const user = await authenticated(request);
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const parsed = preferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid preference' }, { status: 400 });
  try {
    await setTeacherProviderPreference(user.id, parsed.data.providerId, parsed.data.modelId);
    return Response.json({ preference: parsed.data });
  } catch {
    return Response.json({ error: 'Provider is not configured' }, { status: 400 });
  }
}
