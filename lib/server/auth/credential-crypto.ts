import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;

export interface EncryptedCredential {
  encryptionVersion: 1;
  ciphertext: string;
  iv: string;
  authTag: string;
}

function decodeMasterKey(value = process.env.APP_CREDENTIAL_ENCRYPTION_KEY): Buffer {
  if (!value) throw new Error('APP_CREDENTIAL_ENCRYPTION_KEY is required');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error('APP_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }
  return key;
}

function aad(userId: string, providerId: string, version: number): Buffer {
  return Buffer.from(`smartboard-ai|credential|${version}|${userId}|${providerId}`, 'utf8');
}

export function encryptProviderCredential(
  plaintext: string,
  userId: string,
  providerId: string,
  masterKey?: string,
): EncryptedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', decodeMasterKey(masterKey), iv);
  cipher.setAAD(aad(userId, providerId, VERSION));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encryptionVersion: VERSION,
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptProviderCredential(
  encrypted: EncryptedCredential,
  userId: string,
  providerId: string,
  masterKey?: string,
): string {
  if (encrypted.encryptionVersion !== VERSION) {
    throw new Error('Unsupported credential encryption version');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    decodeMasterKey(masterKey),
    Buffer.from(encrypted.iv, 'base64'),
  );
  decipher.setAAD(aad(userId, providerId, encrypted.encryptionVersion));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskCredentialSuffix(secret: string): string {
  return secret.slice(-4);
}
