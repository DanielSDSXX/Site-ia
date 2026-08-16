import { DocumentStatus, ExtractionMethod, NotificationKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { storage } from '@/lib/storage';
import { embeddingProvider } from '@/lib/ai';
import { AIOperation } from '@prisma/client';
import { recordAIUsage } from '@/lib/ai/usage';
import { setChunkEmbedding } from '@/lib/rag/vector-store';
import { logError } from '@/lib/errors';
import { extractDocument } from './extract';
import { chunkPages } from './chunk';
import { classifyDocument, guessDocumentDate } from './classify';
import { isOcrEnabled, ocrImage, ocrPdfPages } from './ocr';

/**
 * Pipeline de ingestão de um documento.
 *
 * Roda sempre no worker (nunca dentro de um request), reportando progresso
 * pelas mesmas etapas que a interface exibe. Cada etapa é idempotente: um job
 * reexecutado após falha refaz o documento do zero em vez de duplicar dados.
 */

export const PIPELINE_STEPS = [
  'Recebendo arquivo',
  'Extraindo texto',
  'Identificando páginas',
  'Estruturando documento',
  'Aplicando OCR',
  'Criando índice de busca',
  'Gerando embeddings',
  'Preparando inteligência',
] as const;

export type ProgressReporter = (percent: number, label: string) => Promise<void> | void;

export interface PipelineResult {
  documentId: string;
  pageCount: number;
  chunkCount: number;
  charCount: number;
  ocrPages: number;
  method: ExtractionMethod;
}

const EMBEDDING_BATCH = 32;

export async function processDocument(
  documentId: string,
  report: ProgressReporter = () => undefined,
): Promise<PipelineResult> {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new Error(`Documento ${documentId} não encontrado.`);
  if (document.deletedAt) throw new Error(`Documento ${documentId} foi excluído.`);

  const started = Date.now();

  try {
    await report(5, PIPELINE_STEPS[0]);
    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.EXTRACTING, processingError: null },
    });

    const buffer = await storage().get(document.storageKey);

    // ---- Extração -------------------------------------------------------
    await report(15, PIPELINE_STEPS[1]);
    const extraction = await extractDocument(buffer, document.mimeType, document.originalFilename);

    // ---- OCR quando necessário -----------------------------------------
    await report(30, PIPELINE_STEPS[4]);
    let ocrPages = 0;
    const pagesNeedingOcr = extraction.pages.filter((p) => p.needsOcr).map((p) => p.pageNumber);

    if (pagesNeedingOcr.length > 0 && isOcrEnabled()) {
      await prisma.document.update({ where: { id: documentId }, data: { status: DocumentStatus.NEEDS_OCR } });

      const ocrResults = document.mimeType.startsWith('image/')
        ? await ocrImage(buffer, document.mimeType.split('/')[1] ?? 'png').then((text) =>
            text ? [{ pageNumber: 1, text }] : [],
          )
        : await ocrPdfPages(buffer, pagesNeedingOcr);

      for (const result of ocrResults) {
        const page = extraction.pages.find((p) => p.pageNumber === result.pageNumber);
        if (page) {
          page.text = result.text;
          page.needsOcr = false;
          ocrPages++;
        }
      }
    }

    const fullText = extraction.pages.map((p) => p.text).join('\n\n');
    const charCount = fullText.length;

    // ---- Persistência das páginas ---------------------------------------
    await report(45, PIPELINE_STEPS[2]);
    await prisma.$transaction([
      prisma.documentPage.deleteMany({ where: { documentId } }),
      prisma.documentChunk.deleteMany({ where: { documentId } }),
    ]);

    await prisma.documentPage.createMany({
      data: extraction.pages.map((page) => ({
        documentId,
        pageNumber: page.pageNumber,
        text: page.text,
        charCount: page.text.length,
        needsOcr: page.needsOcr,
        ocrApplied: !page.needsOcr && pagesNeedingOcr.includes(page.pageNumber),
      })),
    });

    const pages = await prisma.documentPage.findMany({
      where: { documentId },
      select: { id: true, pageNumber: true },
    });
    const pageIdByNumber = new Map(pages.map((p) => [p.pageNumber, p.id]));

    // ---- Classificação --------------------------------------------------
    await report(55, PIPELINE_STEPS[3]);
    const classification =
      document.kind === 'UNKNOWN'
        ? classifyDocument(fullText, document.originalFilename)
        : { kind: document.kind, confidence: 0, matchedTerms: [] };
    const documentDate = document.documentDate ?? guessDocumentDate(fullText);

    // ---- Chunking -------------------------------------------------------
    await report(65, PIPELINE_STEPS[5]);
    const chunks = chunkPages(extraction.pages);

    if (chunks.length > 0) {
      await prisma.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          organizationId: document.organizationId,
          processId: document.processId,
          documentId,
          pageId: pageIdByNumber.get(chunk.pageNumber) ?? null,
          pageNumber: chunk.pageNumber,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenEstimate: chunk.tokenEstimate,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
        })),
      });
    }

    // ---- Embeddings -----------------------------------------------------
    await report(75, PIPELINE_STEPS[6]);
    await prisma.document.update({ where: { id: documentId }, data: { status: DocumentStatus.EMBEDDING } });
    await embedDocumentChunks(documentId, document.organizationId, (done, total) =>
      report(75 + Math.round((done / Math.max(total, 1)) * 20), PIPELINE_STEPS[6]),
    );

    // ---- Conclusão ------------------------------------------------------
    await report(97, PIPELINE_STEPS[7]);
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.INDEXED,
        kind: classification.kind,
        pageCount: extraction.pages.length,
        charCount,
        documentDate,
        extractionMethod: mapMethod(extraction.method),
        processedAt: new Date(),
        processingError: null,
        metadata: {
          ...(extraction.metadata as object),
          classification: {
            kind: classification.kind,
            confidence: classification.confidence,
            matchedTerms: classification.matchedTerms.slice(0, 8),
          },
          ocrPages,
          pagesWithoutText: extraction.pages.filter((p) => p.needsOcr).length,
          durationMs: Date.now() - started,
        },
      },
    });

    if (document.uploadedById) {
      await prisma.notification
        .create({
          data: {
            organizationId: document.organizationId,
            userId: document.uploadedById,
            processId: document.processId,
            kind: NotificationKind.DOCUMENT_PROCESSED,
            title: 'Documento processado',
            body: `"${document.title}" foi indexado (${extraction.pages.length} página(s), ${chunks.length} trecho(s)).`,
            href: document.processId ? `/processos/${document.processId}?aba=documentos` : '/documentos',
          },
        })
        .catch((err) => logError('pipeline.notification', err));
    }

    return {
      documentId,
      pageCount: extraction.pages.length,
      chunkCount: chunks.length,
      charCount,
      ocrPages,
      method: mapMethod(extraction.method),
    };
  } catch (err) {
    await prisma.document
      .update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.FAILED,
          processingError: err instanceof Error ? err.message.slice(0, 500) : 'Erro desconhecido',
        },
      })
      .catch(() => undefined);
    throw err;
  }
}

/** Gera e grava embeddings para todos os chunks pendentes de um documento. */
export async function embedDocumentChunks(
  documentId: string,
  organizationId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const provider = embeddingProvider();
  const pending = await prisma.documentChunk.findMany({
    where: { documentId, embeddedAt: null },
    select: { id: true, content: true },
    orderBy: { chunkIndex: 'asc' },
  });

  let done = 0;
  for (let i = 0; i < pending.length; i += EMBEDDING_BATCH) {
    const batch = pending.slice(i, i + EMBEDDING_BATCH);
    const started = Date.now();
    const result = await provider.embed(batch.map((c) => c.content));

    for (let j = 0; j < batch.length; j++) {
      const vector = result.vectors[j];
      if (!vector) continue;
      await setChunkEmbedding(batch[j].id, vector, result.model);
    }

    await recordAIUsage({
      organizationId,
      operation: AIOperation.EMBEDDING,
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: 0,
      durationMs: Date.now() - started,
    });

    done += batch.length;
    onProgress?.(done, pending.length);
  }

  return done;
}

function mapMethod(method: string): ExtractionMethod {
  switch (method) {
    case 'NATIVE_TEXT':
      return ExtractionMethod.NATIVE_TEXT;
    case 'DOCX':
      return ExtractionMethod.DOCX;
    case 'PLAIN_TEXT':
      return ExtractionMethod.PLAIN_TEXT;
    default:
      return ExtractionMethod.NONE;
  }
}
