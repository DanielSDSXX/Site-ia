import { prisma } from '@/lib/db';
import { embeddingProvider } from '@/lib/ai';
import { searchChunksByText, searchChunksByVector } from './vector-store';

/**
 * Recuperação híbrida: busca vetorial + full-text, fundidas por Reciprocal
 * Rank Fusion (RRF).
 *
 * Por que híbrida: perguntas jurídicas misturam linguagem natural ("o réu
 * negou a cobrança?") com termos exatos que precisam casar literalmente
 * (números, artigos de lei, nomes). Só vetores erram os termos exatos; só
 * full-text erra a paráfrase. RRF combina as duas listas sem exigir que os
 * scores estejam na mesma escala.
 */

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  documentKind: string;
  pageId: string | null;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  score: number;
  vectorScore: number | null;
  textScore: number | null;
}

export interface RetrieveOptions {
  organizationId: string;
  processId?: string | null;
  query: string;
  /** Quantos trechos retornar depois da fusão. */
  limit?: number;
  /** Quantos candidatos buscar em cada modalidade antes de fundir. */
  candidates?: number;
  /** Restringe a documentos específicos. */
  documentIds?: string[];
}

const RRF_K = 60;

export async function retrieve(options: RetrieveOptions): Promise<RetrievedChunk[]> {
  const limit = options.limit ?? 12;
  const candidates = options.candidates ?? Math.max(limit * 4, 40);
  const processId = options.processId ?? null;

  const [vectorHits, textHits] = await Promise.all([
    embedQuery(options.query)
      .then((vector) => searchChunksByVector(options.organizationId, processId, vector, candidates))
      .catch(() => []),
    searchChunksByText(options.organizationId, processId, options.query, candidates).catch(() => []),
  ]);

  const fused = new Map<string, { score: number; vectorScore: number | null; textScore: number | null }>();

  vectorHits.forEach((hit, rank) => {
    const entry = fused.get(hit.id) ?? { score: 0, vectorScore: null, textScore: null };
    entry.score += 1 / (RRF_K + rank + 1);
    entry.vectorScore = Number(hit.score);
    fused.set(hit.id, entry);
  });

  textHits.forEach((hit, rank) => {
    const entry = fused.get(hit.id) ?? { score: 0, vectorScore: null, textScore: null };
    entry.score += 1 / (RRF_K + rank + 1);
    entry.textScore = Number(hit.score);
    fused.set(hit.id, entry);
  });

  if (fused.size === 0) return [];

  const ids = [...fused.keys()];
  const chunks = await prisma.documentChunk.findMany({
    where: {
      id: { in: ids },
      organizationId: options.organizationId,
      ...(options.documentIds?.length ? { documentId: { in: options.documentIds } } : {}),
    },
    include: { document: { select: { id: true, title: true, kind: true } } },
  });

  return chunks
    .map((chunk) => {
      const fusion = fused.get(chunk.id)!;
      return {
        id: chunk.id,
        documentId: chunk.documentId,
        documentTitle: chunk.document.title,
        documentKind: chunk.document.kind,
        pageId: chunk.pageId,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        score: fusion.score,
        vectorScore: fusion.vectorScore,
        textScore: fusion.textScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function embedQuery(query: string): Promise<number[]> {
  const provider = embeddingProvider();
  const result = await provider.embed([query]);
  const vector = result.vectors[0];
  if (!vector) throw new Error('Falha ao gerar embedding da consulta.');
  return vector;
}

/**
 * Recupera uma amostra representativa do processo inteiro, usada por análises
 * que precisam de visão global (resumo, timeline, vulnerabilidades) em vez de
 * responder a uma pergunta específica.
 *
 * Estratégia: cobrir todos os documentos, priorizando as peças mais
 * informativas (petição inicial, contestação, decisões) e distribuindo os
 * trechos ao longo de cada documento para não concentrar tudo no início.
 */
export async function retrieveProcessOverview(
  organizationId: string,
  processId: string,
  maxChunks = 60,
): Promise<RetrievedChunk[]> {
  const documents = await prisma.document.findMany({
    where: { organizationId, processId, deletedAt: null, status: 'INDEXED' },
    select: { id: true, title: true, kind: true, _count: { select: { chunks: true } } },
  });
  if (documents.length === 0) return [];

  const KIND_WEIGHT: Record<string, number> = {
    INITIAL_PETITION: 3,
    ANSWER: 3,
    DECISION: 2.5,
    SENTENCE: 2.5,
    REPLY: 2,
    APPEAL: 2,
    EXPERT_REPORT: 2,
    HEARING_MINUTES: 1.5,
    EVIDENCE: 1,
    CONTRACT: 1.5,
    POWER_OF_ATTORNEY: 0.3,
    OTHER: 1,
    UNKNOWN: 1,
  };

  const totalWeight = documents.reduce((sum, d) => sum + (KIND_WEIGHT[d.kind] ?? 1), 0);
  const results: RetrievedChunk[] = [];

  for (const doc of documents) {
    const weight = KIND_WEIGHT[doc.kind] ?? 1;
    const quota = Math.max(2, Math.round((weight / totalWeight) * maxChunks));
    const available = doc._count.chunks;
    if (available === 0) continue;

    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: doc.id },
      orderBy: { chunkIndex: 'asc' },
      select: {
        id: true,
        documentId: true,
        pageId: true,
        pageNumber: true,
        chunkIndex: true,
        content: true,
      },
    });

    // Amostragem uniforme ao longo do documento.
    const step = Math.max(1, Math.floor(chunks.length / quota));
    for (let i = 0; i < chunks.length && results.length < maxChunks * 1.5; i += step) {
      const chunk = chunks[i];
      results.push({
        ...chunk,
        documentTitle: doc.title,
        documentKind: doc.kind,
        score: weight,
        vectorScore: null,
        textScore: null,
      });
    }
  }

  return results.slice(0, maxChunks);
}
