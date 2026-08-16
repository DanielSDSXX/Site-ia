import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { VECTOR_DIMENSIONS } from '@/lib/ai/types';

/**
 * Acesso à coluna `vector` do pgvector.
 *
 * O Prisma não expõe tipos `Unsupported`, então toda leitura/escrita de
 * embeddings passa por aqui, em SQL parametrizado. Nenhuma string vinda do
 * usuário é interpolada — os vetores são serializados a partir de números
 * validados.
 */

export function isVectorEnabled(): boolean {
  return env().VECTOR_DRIVER === 'pgvector';
}

/** Serializa um vetor no literal aceito pelo pgvector: '[0.1,0.2,...]'. */
export function toVectorLiteral(vector: number[]): string {
  if (vector.length !== VECTOR_DIMENSIONS) {
    throw new Error(`Embedding com dimensão ${vector.length}; esperado ${VECTOR_DIMENSIONS}.`);
  }
  const parts = vector.map((v) => {
    if (!Number.isFinite(v)) throw new Error('Embedding contém valor não numérico.');
    return v.toFixed(6);
  });
  return `[${parts.join(',')}]`;
}

export async function setChunkEmbedding(chunkId: string, vector: number[], model: string) {
  if (!isVectorEnabled()) return;
  const literal = toVectorLiteral(vector);
  await prisma.$executeRaw`
    UPDATE "document_chunks"
    SET "embedding" = ${literal}::vector,
        "embeddingModel" = ${model},
        "embeddedAt" = NOW()
    WHERE "id" = ${chunkId}
  `;
}

export async function setJurisprudenceEmbedding(id: string, vector: number[], model: string) {
  if (!isVectorEnabled()) return;
  const literal = toVectorLiteral(vector);
  await prisma.$executeRaw`
    UPDATE "jurisprudence"
    SET "embedding" = ${literal}::vector, "embeddingModel" = ${model}
    WHERE "id" = ${id}
  `;
}

export async function setMemoryEmbedding(id: string, vector: number[], model: string) {
  if (!isVectorEnabled()) return;
  const literal = toVectorLiteral(vector);
  await prisma.$executeRaw`
    UPDATE "org_memory_items"
    SET "embedding" = ${literal}::vector, "embeddingModel" = ${model}
    WHERE "id" = ${id}
  `;
}

export interface VectorHit {
  id: string;
  score: number;
}

/**
 * Busca vetorial nos chunks de um processo.
 * `1 - (embedding <=> query)` converte distância de cosseno em similaridade.
 */
export async function searchChunksByVector(
  organizationId: string,
  processId: string | null,
  vector: number[],
  limit: number,
): Promise<VectorHit[]> {
  if (!isVectorEnabled()) return [];
  const literal = toVectorLiteral(vector);

  const rows = processId
    ? await prisma.$queryRaw<VectorHit[]>`
        SELECT "id", 1 - ("embedding" <=> ${literal}::vector) AS "score"
        FROM "document_chunks"
        WHERE "organizationId" = ${organizationId}
          AND "processId" = ${processId}
          AND "embedding" IS NOT NULL
        ORDER BY "embedding" <=> ${literal}::vector
        LIMIT ${limit}
      `
    : await prisma.$queryRaw<VectorHit[]>`
        SELECT "id", 1 - ("embedding" <=> ${literal}::vector) AS "score"
        FROM "document_chunks"
        WHERE "organizationId" = ${organizationId}
          AND "embedding" IS NOT NULL
        ORDER BY "embedding" <=> ${literal}::vector
        LIMIT ${limit}
      `;

  return rows;
}

/** Busca full-text (português) nos chunks, com ts_rank normalizado. */
export async function searchChunksByText(
  organizationId: string,
  processId: string | null,
  query: string,
  limit: number,
): Promise<VectorHit[]> {
  const terms = query
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return [];
  const tsQuery = terms.join(' | ');

  return processId
    ? prisma.$queryRaw<VectorHit[]>`
        SELECT "id", ts_rank("searchVector", websearch_to_tsquery('portuguese', ${tsQuery})) AS "score"
        FROM "document_chunks"
        WHERE "organizationId" = ${organizationId}
          AND "processId" = ${processId}
          AND "searchVector" @@ websearch_to_tsquery('portuguese', ${tsQuery})
        ORDER BY "score" DESC
        LIMIT ${limit}
      `
    : prisma.$queryRaw<VectorHit[]>`
        SELECT "id", ts_rank("searchVector", websearch_to_tsquery('portuguese', ${tsQuery})) AS "score"
        FROM "document_chunks"
        WHERE "organizationId" = ${organizationId}
          AND "searchVector" @@ websearch_to_tsquery('portuguese', ${tsQuery})
        ORDER BY "score" DESC
        LIMIT ${limit}
      `;
}

export async function searchJurisprudenceByVector(
  organizationId: string | null,
  vector: number[],
  limit: number,
): Promise<VectorHit[]> {
  if (!isVectorEnabled()) return [];
  const literal = toVectorLiteral(vector);
  return prisma.$queryRaw<VectorHit[]>`
    SELECT "id", 1 - ("embedding" <=> ${literal}::vector) AS "score"
    FROM "jurisprudence"
    WHERE ("organizationId" = ${organizationId} OR "organizationId" IS NULL)
      AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${literal}::vector
    LIMIT ${limit}
  `;
}

export async function searchMemoryByVector(
  organizationId: string,
  vector: number[],
  limit: number,
): Promise<VectorHit[]> {
  if (!isVectorEnabled()) return [];
  const literal = toVectorLiteral(vector);
  return prisma.$queryRaw<VectorHit[]>`
    SELECT "id", 1 - ("embedding" <=> ${literal}::vector) AS "score"
    FROM "org_memory_items"
    WHERE "organizationId" = ${organizationId}
      AND "enabled" = true
      AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${literal}::vector
    LIMIT ${limit}
  `;
}

/** Diagnóstico exibido nas configurações: quantos chunks já foram indexados. */
export async function indexStats(organizationId: string) {
  const [total, embedded] = await Promise.all([
    prisma.documentChunk.count({ where: { organizationId } }),
    prisma.documentChunk.count({ where: { organizationId, embeddedAt: { not: null } } }),
  ]);
  return { total, embedded, pending: total - embedded, driver: env().VECTOR_DRIVER };
}
