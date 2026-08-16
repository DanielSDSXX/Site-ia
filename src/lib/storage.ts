import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';
import { AppError, NotFoundError } from '@/lib/errors';

/**
 * Armazenamento de documentos.
 *
 * Nenhum arquivo é servido estaticamente: o acesso passa sempre pela aplicação
 * (`GET /api/documents/:id/content`), que valida sessão, organização e
 * permissão. Aqui ficam apenas os dois adaptadores — disco local e
 * S3-compatível — e a criptografia opcional em repouso.
 */

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/**
 * Cabeçalho mágico dos arquivos cifrados. Ele existe para que ligar
 * `STORAGE_ENCRYPTION_KEY` num acervo já gravado continue legível: sem o
 * cabeçalho, o conteúdo é texto puro e volta como está.
 */
const ENCRYPTION_MAGIC = Buffer.from('LMENC1');
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/**
 * Monta a chave de armazenamento. O prefixo por organização mantém o
 * isolamento entre escritórios também no disco, e a sanitização impede que um
 * nome de arquivo enviado pelo usuário escape do diretório.
 */
export function buildStorageKey(organizationId: string, documentId: string, filename: string): string {
  return `${sanitizeSegment(organizationId)}/${sanitizeSegment(documentId)}/${sanitizeSegment(filename)}`;
}

function sanitizeSegment(value: string): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/-+/g, '-')
    .slice(0, 120);

  return cleaned.length > 0 ? cleaned : 'arquivo';
}

function encryptionKey(): Buffer | null {
  const raw = env().STORAGE_ENCRYPTION_KEY;
  if (!raw) return null;

  const key = Buffer.from(raw, /^[0-9a-fA-F]{64}$/.test(raw) ? 'hex' : 'base64');
  if (key.length !== 32) {
    throw new AppError('STORAGE_ENCRYPTION_KEY precisa ter 32 bytes (base64 ou hex).');
  }
  return key;
}

function encrypt(data: Buffer): Buffer {
  const key = encryptionKey();
  if (!key) return data;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([ENCRYPTION_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

function decrypt(data: Buffer): Buffer {
  if (!data.subarray(0, ENCRYPTION_MAGIC.length).equals(ENCRYPTION_MAGIC)) {
    return data;
  }

  const key = encryptionKey();
  if (!key) {
    throw new AppError('Arquivo cifrado, mas STORAGE_ENCRYPTION_KEY não está configurada.');
  }

  const ivStart = ENCRYPTION_MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const bodyStart = tagStart + AUTH_TAG_BYTES;

  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(ivStart, tagStart));
  decipher.setAuthTag(data.subarray(tagStart, bodyStart));
  return Buffer.concat([decipher.update(data.subarray(bodyStart)), decipher.final()]);
}

class LocalStorage implements StorageDriver {
  constructor(private readonly baseDir: string) {}

  private pathFor(key: string): string {
    const root = resolve(this.baseDir);
    const target = resolve(join(root, key));
    if (target !== root && !target.startsWith(root + sep)) {
      throw new AppError('Chave de armazenamento inválida.');
    }
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, encrypt(data));
  }

  async get(key: string): Promise<Buffer> {
    try {
      return decrypt(await readFile(this.pathFor(key)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new NotFoundError('Arquivo não encontrado no armazenamento.');
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

class S3Storage implements StorageDriver {
  private readonly client: S3Client;

  constructor(private readonly bucket: string) {
    const config = env();
    this.client = new S3Client({
      region: config.S3_REGION,
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      ...(config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: config.S3_ACCESS_KEY_ID,
              secretAccessKey: config.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: encrypt(data),
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = response.Body;
      if (!body) throw new NotFoundError('Arquivo não encontrado no armazenamento.');
      return decrypt(Buffer.from(await body.transformToByteArray()));
    } catch (err) {
      if ((err as { name?: string })?.name === 'NoSuchKey') {
        throw new NotFoundError('Arquivo não encontrado no armazenamento.');
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let cached: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (cached) return cached;

  const config = env();
  if (config.STORAGE_DRIVER === 's3') {
    if (!config.S3_BUCKET) {
      throw new AppError('STORAGE_DRIVER=s3 exige S3_BUCKET configurado.');
    }
    cached = new S3Storage(config.S3_BUCKET);
  } else {
    cached = new LocalStorage(config.STORAGE_LOCAL_DIR);
  }
  return cached;
}

/** Apenas para testes: descarta o adaptador memorizado. */
export function resetStorageCache() {
  cached = null;
}
