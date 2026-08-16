import { DocumentStatus, SourceType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { allowedUploadMimes, env } from '@/lib/env';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { buildStorageKey, storage } from '@/lib/storage';
import { sha256 } from '@/lib/security/crypto';
import { enqueue } from '@/lib/queue';

/**
 * Ingestão de documentos.
 *
 * O request faz o mínimo: valida, grava o arquivo e enfileira. Extração, OCR,
 * chunking e embeddings acontecem no worker — a interface nunca fica presa
 * esperando um PDF de 400 páginas.
 */

export interface UploadInput {
  organizationId: string;
  userId: string;
  processId?: string | null;
  file: File;
  title?: string;
  kind?: string;
}

export interface UploadResult {
  documentId: string;
  jobId: string;
  duplicated: boolean;
  title: string;
}

/** Assinaturas de arquivo (magic numbers) aceitas. */
const MAGIC_SIGNATURES: { mime: string; bytes: number[]; offset: number }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // %PDF
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 }, // ZIP
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
];

/**
 * Confere se o conteúdo do arquivo corresponde ao MIME declarado.
 *
 * O tipo informado pelo navegador é controlado pelo cliente: sem esta
 * verificação, um executável renomeado para .pdf entraria no storage.
 */
export function verifyMagicNumber(buffer: Buffer, mimeType: string): boolean {
  if (mimeType.startsWith('text/')) {
    // Texto: rejeita bytes nulos, que indicam binário disfarçado.
    return !buffer.subarray(0, 8192).includes(0);
  }
  const signature = MAGIC_SIGNATURES.find((s) => s.mime === mimeType);
  if (!signature) return false;
  return signature.bytes.every((byte, index) => buffer[signature.offset + index] === byte);
}

export async function uploadDocument(input: UploadInput): Promise<UploadResult> {
  const { organizationId, userId, file } = input;

  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size === 0) throw new ValidationError('O arquivo está vazio.');
  if (file.size > maxBytes) {
    throw new ValidationError(`Arquivo maior que o limite de ${env().MAX_UPLOAD_MB} MB.`);
  }

  const mimeType = file.type || inferMimeFromName(file.name);
  if (!allowedUploadMimes().includes(mimeType)) {
    throw new ValidationError(
      `Tipo de arquivo não permitido (${mimeType || 'desconhecido'}). Aceitamos PDF, DOCX, TXT, PNG e JPEG.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!verifyMagicNumber(buffer, mimeType)) {
    throw new ValidationError(
      'O conteúdo do arquivo não corresponde à extensão informada. Envio bloqueado por segurança.',
    );
  }

  if (input.processId) {
    const process = await prisma.process.findFirst({
      where: { id: input.processId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!process) throw new NotFoundError('Processo não encontrado.');
  }

  const hash = sha256(buffer);

  // Deduplicação por hash dentro do mesmo processo.
  const existing = await prisma.document.findFirst({
    where: {
      organizationId,
      sha256: hash,
      processId: input.processId ?? null,
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
  if (existing) {
    return { documentId: existing.id, jobId: '', duplicated: true, title: existing.title };
  }

  const title = (input.title?.trim() || file.name.replace(/\.[^.]+$/, '')).slice(0, 200);

  const document = await prisma.document.create({
    data: {
      organizationId,
      processId: input.processId ?? null,
      uploadedById: userId,
      title,
      originalFilename: file.name.slice(0, 255),
      mimeType,
      sizeBytes: buffer.byteLength,
      sha256: hash,
      storageKey: 'pending',
      status: DocumentStatus.PENDING,
      sourceType: SourceType.UPLOAD,
      kind: (input.kind as never) ?? 'UNKNOWN',
    },
  });

  const storageKey = buildStorageKey(organizationId, document.id, file.name);

  try {
    await storage().put(storageKey, buffer, mimeType);
  } catch (err) {
    await prisma.document.delete({ where: { id: document.id } }).catch(() => undefined);
    throw err;
  }

  await prisma.document.update({ where: { id: document.id }, data: { storageKey } });

  const job = await enqueue(
    'document.process',
    { documentId: document.id },
    { organizationId, priority: 5 },
  );

  return { documentId: document.id, jobId: job.id, duplicated: false, title };
}

function inferMimeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return map[ext] ?? '';
}

export async function getDocument(organizationId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    include: {
      process: { select: { id: true, number: true } },
      uploadedBy: { select: { id: true, name: true } },
      _count: { select: { pages: true, chunks: true, citations: true } },
    },
  });
  if (!document) throw new NotFoundError('Documento não encontrado.');
  return document;
}

export async function getDocumentContent(organizationId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: { id: true, storageKey: true, mimeType: true, originalFilename: true, sizeBytes: true },
  });
  if (!document) throw new NotFoundError('Documento não encontrado.');

  const buffer = await storage().get(document.storageKey);
  return { document, buffer };
}

export async function getDocumentPages(organizationId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!document) throw new NotFoundError('Documento não encontrado.');

  return prisma.documentPage.findMany({
    where: { documentId },
    orderBy: { pageNumber: 'asc' },
    select: { id: true, pageNumber: true, charCount: true, needsOcr: true, ocrApplied: true },
  });
}

export async function getPageText(organizationId: string, documentId: string, pageNumber: number) {
  const page = await prisma.documentPage.findFirst({
    where: { documentId, pageNumber, document: { organizationId, deletedAt: null } },
    select: { id: true, pageNumber: true, text: true, needsOcr: true },
  });
  if (!page) throw new NotFoundError('Página não encontrada.');
  return page;
}

export async function listDocuments(
  organizationId: string,
  options: { processId?: string | null; q?: string; page?: number; pageSize?: number } = {},
) {
  const page = options.page ?? 1;
  const pageSize = Math.min(options.pageSize ?? 30, 100);

  const where = {
    organizationId,
    deletedAt: null,
    ...(options.processId !== undefined ? { processId: options.processId } : {}),
    ...(options.q
      ? {
          OR: [
            { title: { contains: options.q, mode: 'insensitive' as const } },
            { originalFilename: { contains: options.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        kind: true,
        status: true,
        mimeType: true,
        sizeBytes: true,
        pageCount: true,
        createdAt: true,
        documentDate: true,
        processingError: true,
        process: { select: { id: true, number: true } },
      },
    }),
  ]);

  return { items, total, page, pageSize };
}

export async function softDeleteDocument(organizationId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: { id: true, storageKey: true },
  });
  if (!document) throw new NotFoundError('Documento não encontrado.');

  await prisma.$transaction([
    prisma.documentChunk.deleteMany({ where: { documentId } }),
    prisma.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } }),
  ]);

  // O arquivo é removido do storage: exclusão de documento jurídico precisa
  // ser efetiva (LGPD, art. 18, VI), não apenas ocultar da listagem.
  await storage()
    .delete(document.storageKey)
    .catch(() => undefined);
}

export async function reprocessDocument(organizationId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!document) throw new NotFoundError('Documento não encontrado.');

  await prisma.document.update({
    where: { id: documentId },
    data: { status: DocumentStatus.PENDING, processingError: null },
  });

  return enqueue('document.process', { documentId }, { organizationId, priority: 5 });
}

/** Estado agregado do processamento — alimenta a barra de progresso. */
export async function processingStatus(organizationId: string, processId?: string | null) {
  const documents = await prisma.document.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(processId ? { processId } : {}),
      status: { not: DocumentStatus.INDEXED },
    },
    select: { id: true, title: true, status: true, processingError: true },
  });

  const jobs = await prisma.job.findMany({
    where: {
      organizationId,
      type: 'document.process',
      status: { in: ['QUEUED', 'RUNNING'] },
    },
    select: { id: true, payload: true, progress: true, progressLabel: true, status: true },
  });

  return {
    documents,
    jobs: jobs.map((job) => ({
      id: job.id,
      documentId: (job.payload as { documentId?: string })?.documentId ?? null,
      progress: job.progress,
      label: job.progressLabel,
      status: job.status,
    })),
    done: documents.length === 0 && jobs.length === 0,
  };
}

export function assertSupportedForViewer(mimeType: string) {
  if (mimeType !== 'application/pdf') {
    throw new AppError('A visualização integrada está disponível para PDFs.', {
      status: 415,
      expose: true,
    });
  }
}
