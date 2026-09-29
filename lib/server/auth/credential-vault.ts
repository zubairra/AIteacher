import { PROVIDERS } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/types/provider';
import { firebaseAdminDb } from '@/lib/server/firebase/admin';
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskCredentialSuffix,
  type EncryptedCredential,
} from './credential-crypto';

export type CredentialVerificationStatus = 'verified' | 'unverified';
export interface ProviderCredentialMetadata {
  providerId: string;
  configured: boolean;
  maskedSuffix?: string;
  verificationStatus?: CredentialVerificationStatus;
  updatedAt?: string;
}

export function teacherProviderCatalog() {
  return Object.values(PROVIDERS)
    .filter((provider) => provider.requiresApiKey && provider.type !== 'bedrock')
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: provider.models.map((model) => ({ id: model.id, name: model.name })),
    }));
}

export function isTeacherProviderId(value: string): value is ProviderId {
  return (
    Object.prototype.hasOwnProperty.call(PROVIDERS, value) &&
    PROVIDERS[value as ProviderId].requiresApiKey
  );
}

function credentialCollection(userId: string) {
  return firebaseAdminDb().collection(`users/${userId}/providerCredentials`);
}

export async function listTeacherProviderCredentials(
  userId: string,
): Promise<ProviderCredentialMetadata[]> {
  const snapshot = await credentialCollection(userId).get();
  const rows = new Map(snapshot.docs.map((document) => [document.id, document.data()]));
  return teacherProviderCatalog().map((provider) => {
    const row = rows.get(provider.id);
    return row
      ? {
          providerId: provider.id,
          configured: true,
          maskedSuffix: String(row.maskedSuffix),
          verificationStatus: row.verificationStatus as CredentialVerificationStatus,
          updatedAt: new Date(Number(row.updatedAt)).toISOString(),
        }
      : { providerId: provider.id, configured: false };
  });
}

export async function saveTeacherProviderCredential(input: {
  userId: string;
  providerId: string;
  apiKey: string;
  modelId?: string;
  verificationStatus: CredentialVerificationStatus;
}): Promise<void> {
  if (!isTeacherProviderId(input.providerId)) throw new Error('Unsupported provider');
  const apiKey = input.apiKey.trim();
  if (apiKey.length < 8 || apiKey.length > 4096) throw new Error('Invalid API key');
  const encrypted = encryptProviderCredential(apiKey, input.userId, input.providerId);
  const db = firebaseAdminDb();
  const batch = db.batch();
  batch.set(
    credentialCollection(input.userId).doc(input.providerId),
    {
      version: 1,
      encryptionVersion: encrypted.encryptionVersion,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      maskedSuffix: maskCredentialSuffix(apiKey),
      verificationStatus: input.verificationStatus,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
  if (input.modelId)
    batch.set(
      db.doc(`users/${input.userId}/settings/ai`),
      { version: 1, providerId: input.providerId, modelId: input.modelId, updatedAt: Date.now() },
      { merge: true },
    );
  await batch.commit();
}

export async function removeTeacherProviderCredential(userId: string, providerId: string) {
  const db = firebaseAdminDb();
  await db.runTransaction(async (transaction) => {
    transaction.delete(credentialCollection(userId).doc(providerId));
    const preference = db.doc(`users/${userId}/settings/ai`);
    const snapshot = await transaction.get(preference);
    if (snapshot.data()?.providerId === providerId) transaction.delete(preference);
  });
}

export async function setTeacherProviderPreference(
  userId: string,
  providerId: string,
  modelId: string,
) {
  if (
    !isTeacherProviderId(providerId) ||
    !PROVIDERS[providerId].models.some((model) => model.id === modelId)
  )
    throw new Error('Unsupported provider or model');
  if (!(await credentialCollection(userId).doc(providerId).get()).exists)
    throw new Error('Provider is not configured');
  await firebaseAdminDb()
    .doc(`users/${userId}/settings/ai`)
    .set({ version: 1, providerId, modelId, updatedAt: Date.now() }, { merge: true });
}

export async function resolveTeacherProviderCredential(
  userId: string,
  requestedProviderId?: string,
  requestedModelId?: string,
) {
  const db = firebaseAdminDb();
  const preference = (await db.doc(`users/${userId}/settings/ai`).get()).data();
  const providerId = requestedProviderId || preference?.providerId;
  if (!providerId || !isTeacherProviderId(providerId)) return null;
  const snapshot = await credentialCollection(userId).doc(providerId).get();
  const row = snapshot.data();
  if (!row) return null;
  const modelId = requestedModelId || preference?.modelId || PROVIDERS[providerId].models[0]?.id;
  if (!modelId || !PROVIDERS[providerId].models.some((model) => model.id === modelId)) return null;
  const encrypted: EncryptedCredential = {
    encryptionVersion: row.encryptionVersion,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  };
  return { providerId, modelId, apiKey: decryptProviderCredential(encrypted, userId, providerId) };
}

export async function getTeacherProviderPreference(userId: string) {
  const row = (await firebaseAdminDb().doc(`users/${userId}/settings/ai`).get()).data();
  return { providerId: row?.providerId ?? null, modelId: row?.modelId ?? null };
}
