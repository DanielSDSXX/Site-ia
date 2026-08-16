import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/** SHA-256 hex. Usado para tokens, hashes de arquivo e pseudonimização de IP. */
export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Token opaco de 256 bits em base64url. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Comparação em tempo constante entre duas strings hexadecimais/base64. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Pseudonimiza um endereço IP antes de gravá-lo em logs de auditoria.
 * Mantém utilidade forense sem armazenar o dado pessoal em claro (LGPD).
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return sha256(`${ip}::${env().SESSION_SECRET}`).slice(0, 32);
}

// ---------------------------------------------------------------------------
// Criptografia de arquivos em repouso (AES-256-GCM)
// ---------------------------------------------------------------------------

const MAGIC = Buffer.from('LMENC1');

function encryptionKey(): Buffer | null {
  const raw = env().STORAGE_ENCRYPTION_KEY;
  if (!raw) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('STORAGE_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes).');
  }
  return Buffer.from(raw, 'hex');
}

export function isEncryptionEnabled(): boolean {
  return encryptionKey() !== null;
}

/** Formato: MAGIC(6) | iv(12) | authTag(16) | ciphertext */
export function encryptBuffer(plain: Buffer): Buffer {
  const key = encryptionKey();
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBuffer(stored: Buffer): Buffer {
  if (stored.length < MAGIC.length || !stored.subarray(0, MAGIC.length).equals(MAGIC)) {
    // Arquivo gravado antes de a criptografia ser ativada.
    return stored;
  }
  const key = encryptionKey();
  if (!key) {
    throw new Error(
      'Arquivo criptografado, mas STORAGE_ENCRYPTION_KEY não está configurada.',
    );
  }
  const iv = stored.subarray(6, 18);
  const tag = stored.subarray(18, 34);
  const ciphertext = stored.subarray(34);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
