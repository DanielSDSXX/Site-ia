import { z } from 'zod';
import { prisma } from '@/lib/db';
import { embeddingProvider } from '@/lib/ai';
import { setMemoryEmbedding } from '@/lib/rag/vector-store';
import { NotFoundError } from '@/lib/errors';
import type { memoryItemSchema } from '@/lib/validation';

/**
 * Memória do Escritório.
 *
 * Conhecimento interno que o próprio escritório autoriza a plataforma a usar
 * como referência de estilo e estratégia. Nunca é tratado como prova de um
 * processo nem como jurisprudência verificada — o prompt que injeta esses
 * itens deixa isso explícito para o modelo.
 *
 * O conteúdo é isolado por organização: um item de memória jamais é
 * recuperado por outro escritório.
 */

export type MemoryItemInput = z.infer<typeof memoryItemSchema>;

export const MEMORY_KIND_LABELS: Record<string, string> = {
  TEMPLATE: 'Modelo de peça',
  THESIS: 'Tese',
  BRIEF: 'Peça de referência',
  FAVORABLE_DECISION: 'Decisão favorável',
  PREFERRED_JURISPRUDENCE: 'Jurisprudência preferida',
  STYLE_GUIDE: 'Padrão de linguagem',
  STRATEGY: 'Estratégia',
  INTERNAL_KNOWLEDGE: 'Conhecimento interno',
};

export async function listMemoryItems(organizationId: string, kind?: string) {
  return prisma.orgMemoryItem.findMany({
    where: { organizationId, ...(kind ? { kind: kind as never } : {}) },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      kind: true,
      title: true,
      content: true,
      tags: true,
      enabled: true,
      embeddingModel: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createMemoryItem(organizationId: string, input: MemoryItemInput) {
  const item = await prisma.orgMemoryItem.create({
    data: {
      organizationId,
      kind: input.kind,
      title: input.title,
      content: input.content,
      tags: input.tags,
    },
  });

  await embedMemoryItem(item.id);
  return item;
}

export async function embedMemoryItem(id: string) {
  const item = await prisma.orgMemoryItem.findUnique({
    where: { id },
    select: { id: true, title: true, content: true, tags: true },
  });
  if (!item) return;

  const provider = embeddingProvider();
  const text = `${item.title}\n${item.tags.join(' ')}\n${item.content.slice(0, 8000)}`;
  const { vectors, model } = await provider.embed([text]);
  if (vectors[0]) await setMemoryEmbedding(item.id, vectors[0], model);
}

export async function toggleMemoryItem(organizationId: string, id: string, enabled: boolean) {
  const item = await prisma.orgMemoryItem.findFirst({ where: { id, organizationId } });
  if (!item) throw new NotFoundError('Item não encontrado.');
  return prisma.orgMemoryItem.update({ where: { id }, data: { enabled } });
}

export async function deleteMemoryItem(organizationId: string, id: string) {
  const item = await prisma.orgMemoryItem.findFirst({ where: { id, organizationId } });
  if (!item) throw new NotFoundError('Item não encontrado.');
  await prisma.orgMemoryItem.delete({ where: { id } });
}
