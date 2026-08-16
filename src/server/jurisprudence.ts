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

export type OfficialJurisprudenceLike = Pick<
  JurisprudenceHit,
  'verified' | 'isDemo' | 'sourceUrl'
>;

export function isOfficialJurisprudenceRecord(
  record: OfficialJurisprudenceLike,
): boolean {
  if (!record.verified || record.isDemo || !record.sourceUrl) return false;

  try {
    const parsed = new URL(record.sourceUrl);
    const protocolIsAllowed = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const hostIsNotPlaceholder = !['localhost', 'example.com', 'example.org', 'example.net'].includes(
      parsed.hostname.toLowerCase(),
    );
    return protocolIsAllowed && hostIsNotPlaceholder && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function filterOfficialJurisprudenceRecords<T extends OfficialJurisprudenceLike>(
  records: T[],
): T[] {
  return records.filter((record) => isOfficialJurisprudenceRecord(record));
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
      verified: true,
    },
  });

  // Tenta fazer embedding de forma assíncrona
  embedJurisprudence(created.id).catch((err) => {
    console.error('Erro ao gerar embedding para jurisprudência:', err);
  });

  return created;
}

export async function embedJurisprudence(id: string) {
  try {
    const item = await prisma.jurisprudence.findUnique({
      where: { id },
      select: { id: true, court: true, summary: true, thesis: true, outcome: true },
    });
    if (!item) return;

    const provider = embeddingProvider();
    const text = [item.court, item.summary, item.thesis, item.outcome]
      .filter(Boolean)
      .join('\n');
    
    const { vectors, model } = await provider.embed([text]);
    if (vectors[0]) {
      await setJurisprudenceEmbedding(item.id, vectors[0], model);
    }
  } catch (error) {
    console.error(`Erro ao embedar jurisprudência ${id}:`, error);
    // Não falha a operação - o documento fica sem embedding mas ainda é pesquisável por lexical
  }
}

/**
 * Busca no acervo de jurisprudência do escritório.
 *
 * NÃO consulta o DataJud. A API Pública do CNJ é fonte oficial de dados
 * processuais e movimentações — ela não publica ementas, inteiro teor nem
 * tese firmada. Encaixá-la aqui devolvia sempre zero resultado (todo registro
 * caía no filtro por falta de ementa e de link) e ainda apagava o acervo
 * local do caminho. A consulta ao DataJud vive em `src/server/datajud.ts`,
 * onde ela faz o que a API realmente entrega.
 */
export async function searchJurisprudence(
  organizationId: string,
  params: JurisprudenceSearch,
): Promise<JurisprudenceHit[]> {
  const provider = embeddingProvider();

  let vectorHits: { id: string; score: number }[] = [];
  
  try {
    // Tenta busca vetorial com timeout
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout na busca vetorial')), 5000)
    );
    
    const vectorPromise = provider.embed([params.q]);
    const { vectors } = await Promise.race([vectorPromise, timeoutPromise]) as any;
    
    if (vectors?.[0]) {
      vectorHits = await searchJurisprudenceByVector(
        organizationId,
        vectors[0],
        params.limit * 3
      ).catch((err) => {
        console.warn('Falha na busca vetorial:', err.message);
        return [];
      });
    }
  } catch (error) {
    // Log mas não falha
    console.warn('Erro ao executar busca vetorial:', error);
  }

  // Busca lexical é SEMPRE executada como fallback
  const rows = await prisma.jurisprudence.findMany({
    where: {
      OR: [
        { organizationId },
        { organizationId: null }, // Jurisprudência compartilhada
      ],
      ...(params.court ? { court: { contains: params.court, mode: 'insensitive' } } : {}),
    },
    take: 500,
  });

  // Por padrão só entram decisões verificadas com fonte oficial. O acervo de
  // demonstração fica atrás de um interruptor explícito para que uma instalação
  // nova não pareça quebrada com zero resultados — e ele chega à interface
  // marcado como fictício.
  const candidates = params.includeDemo ? rows : filterOfficialJurisprudenceRecords(rows);

  if (candidates.length === 0) {
    return [];
  }

  // Ranking combinado
  const scoreById = new Map(vectorHits.map((h) => [h.id, Number(h.score)]));
  
  const lexical = rankDocuments(
    candidates.map(
      (c) =>
        `${c.court} ${c.summary} ${c.thesis ?? ''} ${c.outcome ?? ''} ${c.caseNumber}`
    ),
    tokenize(params.q),
  );

  const maxLexical = Math.max(...lexical.map((l) => l.score), 1);

  const combined = candidates.map((item, index) => {
    const lexicalEntry = lexical.find((l) => l.index === index);
    const lexicalScore = (lexicalEntry?.score ?? 0) / maxLexical;
    const vectorScore = scoreById.get(item.id) ?? 0;
    
    // Ponderação: 40% vetorial + 60% lexical (lexical é mais confiável)
    const finalScore = vectorScore * 0.4 + lexicalScore * 0.6;

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
      score: finalScore,
    };
  });

  return combined
    .filter((item) => item.score > 0.05) // Threshold mínimo
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit);
}

/**
 * Lista o acervo. Diferente da busca, aqui mostramos TUDO o que está gravado
 * — inclusive os itens de demonstração —, porque esta é a tela de gestão do
 * acervo: esconder registros faria o usuário achar que a importação falhou.
 * A interface marca cada linha com a origem.
 */
export async function listJurisprudence(organizationId: string, limit = 50) {
  return prisma.jurisprudence.findMany({
    where: { OR: [{ organizationId }, { organizationId: null }] },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function deleteJurisprudence(organizationId: string, id: string) {
  const item = await prisma.jurisprudence.findFirst({
    where: { id, organizationId },
  });
  if (!item) {
    throw new NotFoundError('Registro não encontrado ou pertence ao acervo compartilhado.');
  }

  return prisma.jurisprudence.delete({ where: { id } });
}
