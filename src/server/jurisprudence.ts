import { z } from 'zod';
import { prisma } from '@/lib/db';
import { embeddingProvider } from '@/lib/ai';
import { searchJurisprudenceByVector, setJurisprudenceEmbedding } from '@/lib/rag/vector-store';
import { rankDocuments, tokenize } from '@/lib/text/nlp';
import { NotFoundError } from '@/lib/errors';
import type { jurisprudenceImportSchema, jurisprudenceSearchSchema } from '@/lib/validation';

/**
 * Acervo de jurisprudência.
 *
 * REGRA DE PRODUTO: a plataforma NÃO gera jurisprudência. Ela só pesquisa no
 * que foi importado com fonte identificável (`sourceUrl` + `sourceName`).
 * Entradas sem URL verificável não podem ser criadas, e as sementes de
 * demonstração ficam marcadas com `isDemo = true` e aparecem rotuladas na
 * interface como fictícias.
 */

export type JurisprudenceInput = z.infer<typeof jurisprudenceImportSchema>;
export type JurisprudenceSearch = z.infer<typeof jurisprudenceSearchSchema>;

export interface JurisprudenceHit {
  id: string;
  court: string;
  judgingBody: string | null;
  caseNumber: string;
  judgmentDate: Date | null;
  reporter: string | null;
  summary: string;
  thesis: string | null;
  outcome: string | null;
  excerpt: string | null;
  sourceUrl: string | null;
  sourceName: string;
  verified: boolean;
  isDemo: boolean;
  score: number;
}

export async function importJurisprudence(organizationId: string, input: JurisprudenceInput) {
  const created = await prisma.jurisprudence.create({
    data: {
      organizationId,
      court: input.court,
      judgingBody: input.judgingBody ?? null,
      caseNumber: input.caseNumber,
      judgmentDate: input.judgmentDate ?? null,
      reporter: input.reporter ?? null,
      summary: input.summary,
      thesis: input.thesis ?? null,
      outcome: input.outcome ?? null,
      excerpt: input.excerpt ?? null,
      sourceUrl: input.sourceUrl,
      sourceName: input.sourceName,
      // "verified" indica apenas que há uma fonte informada pelo usuário.
      // A plataforma não valida o conteúdo do link automaticamente.
      verified: true,
    },
  });

  await embedJurisprudence(created.id);
  return created;
}

export async function embedJurisprudence(id: string) {
  const item = await prisma.jurisprudence.findUnique({
    where: { id },
    select: { id: true, court: true, summary: true, thesis: true, outcome: true },
  });
  if (!item) return;

  const provider = embeddingProvider();
  const text = [item.court, item.summary, item.thesis, item.outcome].filter(Boolean).join('\n');
  const { vectors, model } = await provider.embed([text]);
  if (vectors[0]) await setJurisprudenceEmbedding(item.id, vectors[0], model);
}

export async function searchJurisprudence(
  organizationId: string,
  params: JurisprudenceSearch,
): Promise<JurisprudenceHit[]> {
  const provider = embeddingProvider();

  let vectorHits: { id: string; score: number }[] = [];
  try {
    const { vectors } = await provider.embed([params.q]);
    if (vectors[0]) {
      vectorHits = await searchJurisprudenceByVector(organizationId, vectors[0], params.limit * 3);
    }
  } catch {
    // Sem busca vetorial disponível, seguimos apenas com o ranqueamento lexical.
  }

  const candidates = await prisma.jurisprudence.findMany({
    where: {
      OR: [{ organizationId }, { organizationId: null }],
      ...(params.court ? { court: { contains: params.court, mode: 'insensitive' } } : {}),
    },
    take: 500,
  });

  if (candidates.length === 0) return [];

  const scoreById = new Map(vectorHits.map((h) => [h.id, Number(h.score)]));
  const lexical = rankDocuments(
    candidates.map((c) => `${c.court} ${c.summary} ${c.thesis ?? ''} ${c.outcome ?? ''}`),
    tokenize(params.q),
  );
  const maxLexical = Math.max(...lexical.map((l) => l.score), 1);

  const combined = candidates.map((item, index) => {
    const lexicalEntry = lexical.find((l) => l.index === index);
    const lexicalScore = (lexicalEntry?.score ?? 0) / maxLexical;
    const vectorScore = scoreById.get(item.id) ?? 0;
    return {
      id: item.id,
      court: item.court,
      judgingBody: item.judgingBody,
      caseNumber: item.caseNumber,
      judgmentDate: item.judgmentDate,
      reporter: item.reporter,
      summary: item.summary,
      thesis: item.thesis,
      outcome: item.outcome,
      excerpt: item.excerpt,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      verified: item.verified,
      isDemo: item.isDemo,
      score: vectorScore * 0.6 + lexicalScore * 0.4,
    };
  });

  return combined
    .filter((item) => item.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit);
}

export async function listJurisprudence(organizationId: string, limit = 50) {
  return prisma.jurisprudence.findMany({
    where: { OR: [{ organizationId }, { organizationId: null }] },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function deleteJurisprudence(organizationId: string, id: string) {
  const item = await prisma.jurisprudence.findFirst({ where: { id, organizationId } });
  if (!item) throw new NotFoundError('Registro não encontrado ou pertence ao acervo compartilhado.');
  await prisma.jurisprudence.delete({ where: { id } });
}
