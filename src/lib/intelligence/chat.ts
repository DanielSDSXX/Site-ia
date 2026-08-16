import { AIOperation, Confidence, MessageRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { aiProvider } from '@/lib/ai';
import { recordAIUsage } from '@/lib/ai/usage';
import { buildContext } from '@/lib/rag/context';
import { retrieve } from '@/lib/rag/retriever';
import { searchMemoryByVector } from '@/lib/rag/vector-store';
import { embeddingProvider } from '@/lib/ai';
import { AppError, logError } from '@/lib/errors';
import { chatSystemPrompt, memoryAugmentation } from './prompts';
import { extractInlineRefs, resolveRefs, stripInvalidRefs, adjustConfidence } from './grounding';

/**
 * Chat contextual do processo.
 *
 * Nunca enviamos o processo inteiro ao modelo: recuperamos os trechos
 * relevantes para a pergunta (mais o histórico recente da conversa) e
 * validamos as citações da resposta contra esses trechos.
 */

export interface ChatRequest {
  organizationId: string;
  processId: string;
  userId: string;
  threadId?: string | null;
  question: string;
  verbosity?: 'short' | 'detailed';
  /** Usa a Memória do Escritório como referência de estilo/estratégia. */
  useOrgMemory?: boolean;
}

export interface ChatResponse {
  threadId: string;
  messageId: string;
  content: string;
  confidence: Confidence;
  demo: boolean;
  citations: {
    ref: string;
    documentId: string;
    documentTitle: string;
    pageNumber: number;
    quote: string;
  }[];
  droppedRefs: string[];
}

const HISTORY_LIMIT = 8;

export async function askProcess(request: ChatRequest): Promise<ChatResponse> {
  const { organizationId, processId, userId } = request;
  const question = request.question.trim();
  if (question.length < 2) throw new AppError('Escreva uma pergunta.', { status: 422, expose: true });

  const process = await prisma.process.findFirst({
    where: { id: processId, organizationId, deletedAt: null },
    select: { id: true, number: true, subject: true },
  });
  if (!process) throw new AppError('Processo não encontrado.', { status: 404, expose: true });

  const thread = request.threadId
    ? await prisma.chatThread.findFirst({
        where: { id: request.threadId, organizationId, processId, userId },
      })
    : null;

  const activeThread =
    thread ??
    (await prisma.chatThread.create({
      data: {
        organizationId,
        processId,
        userId,
        title: question.slice(0, 60),
      },
    }));

  await prisma.aIMessage.create({
    data: { organizationId, threadId: activeThread.id, role: MessageRole.USER, content: question },
  });

  const started = Date.now();

  try {
    const chunks = await retrieve({ organizationId, processId, query: question, limit: 14 });
    const context = buildContext(chunks, 40_000);

    if (context.blocks.length === 0) {
      return persistAssistantMessage({
        organizationId,
        thread: activeThread,
        content:
          'Não foi possível identificar essa informação nos documentos disponíveis — este processo ainda não tem trechos indexados. Envie as peças do processo para que eu possa consultá-las.',
        confidence: Confidence.LOW,
        demo: aiProvider().isDemo,
        citations: [],
        droppedRefs: [],
        verbosity: request.verbosity ?? 'detailed',
        provider: 'none',
        model: 'none',
        chunkIds: [],
      });
    }

    const history = await prisma.aIMessage.findMany({
      where: { threadId: activeThread.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { role: true, content: true },
    });

    const memoryBlock = request.useOrgMemory ? await loadOrgMemory(organizationId, question) : '';

    const provider = aiProvider();
    const system = chatSystemPrompt(request.verbosity ?? 'detailed') + memoryBlock;

    // A pergunta vai delimitada por <pergunta>: é a convenção que permite ao
    // provedor local separar a consulta do cabeçalho do prompt (ver
    // src/lib/ai/providers/local.ts) sem afetar os provedores de LLM.
    const userMessage = `PROCESSO: ${process.number}${process.subject ? ` — ${process.subject}` : ''}

${context.text}

PERGUNTA DO ADVOGADO:
<pergunta>${question}</pergunta>`;

    const messages = history
      .reverse()
      .slice(0, -1) // remove a pergunta atual, adicionada abaixo com o contexto
      .map((m) => ({
        role: (m.role === MessageRole.ASSISTANT ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content.slice(0, 2000),
      }));

    const response = await provider.complete({
      system,
      messages: [...messages, { role: 'user', content: userMessage }],
      maxTokens: request.verbosity === 'short' ? 700 : 2500,
      temperature: 0.2,
    });

    const { text: cleanedText, dropped } = stripInvalidRefs(response.text, context);
    const citedRefs = extractInlineRefs(cleanedText);
    const { valid } = resolveRefs(citedRefs, context);

    const declared = detectDeclaredConfidence(cleanedText);
    const confidence = provider.isDemo
      ? Confidence.LOW
      : (adjustConfidence(declared, valid, dropped.length) as Confidence);

    await recordAIUsage({
      organizationId,
      userId,
      processId,
      operation: AIOperation.CHAT,
      provider: response.provider,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      durationMs: Date.now() - started,
    });

    return persistAssistantMessage({
      organizationId,
      thread: activeThread,
      content: cleanedText,
      confidence,
      demo: provider.isDemo,
      citations: valid,
      droppedRefs: dropped,
      verbosity: request.verbosity ?? 'detailed',
      provider: response.provider,
      model: response.model,
      chunkIds: context.chunkIds,
    });
  } catch (err) {
    logError('chat.ask', err, { processId, userId });
    throw err;
  }
}

interface PersistArgs {
  organizationId: string;
  thread: { id: string };
  content: string;
  confidence: Confidence;
  demo: boolean;
  citations: {
    ref: string;
    chunkId?: string;
    documentId: string;
    documentTitle: string;
    pageId?: string | null;
    pageNumber: number;
    quote: string;
    relevance?: number;
  }[];
  droppedRefs: string[];
  verbosity: string;
  provider: string;
  model: string;
  chunkIds: string[];
}

async function persistAssistantMessage(args: PersistArgs): Promise<ChatResponse> {
  const message = await prisma.aIMessage.create({
    data: {
      organizationId: args.organizationId,
      threadId: args.thread.id,
      role: MessageRole.ASSISTANT,
      content: args.content,
      confidence: args.confidence,
      provider: args.provider,
      model: args.model,
      chunkIdsUsed: args.chunkIds,
      verbosity: args.verbosity,
    },
  });

  if (args.citations.length > 0) {
    await prisma.citation.createMany({
      data: args.citations.map((citation) => ({
        organizationId: args.organizationId,
        documentId: citation.documentId,
        pageId: citation.pageId ?? null,
        chunkId: citation.chunkId ?? null,
        pageNumber: citation.pageNumber,
        quote: citation.quote.slice(0, 1500),
        relevance: citation.relevance ?? 0,
        messageId: message.id,
      })),
    });
  }

  await prisma.chatThread.update({ where: { id: args.thread.id }, data: { updatedAt: new Date() } });

  return {
    threadId: args.thread.id,
    messageId: message.id,
    content: args.content,
    confidence: args.confidence,
    demo: args.demo,
    citations: args.citations.map((c) => ({
      ref: c.ref,
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      pageNumber: c.pageNumber,
      quote: c.quote,
    })),
    droppedRefs: args.droppedRefs,
  };
}

function detectDeclaredConfidence(text: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  const match = text.match(/confian[çc]a:\s*(alta|m[ée]dia|baixa)/i);
  if (!match) return 'MEDIUM';
  const value = match[1].toLowerCase();
  if (value.startsWith('alta')) return 'HIGH';
  if (value.startsWith('baixa')) return 'LOW';
  return 'MEDIUM';
}

async function loadOrgMemory(organizationId: string, question: string): Promise<string> {
  try {
    const provider = embeddingProvider();
    const { vectors } = await provider.embed([question]);
    if (!vectors[0]) return '';
    const hits = await searchMemoryByVector(organizationId, vectors[0], 4);
    if (hits.length === 0) return '';

    const items = await prisma.orgMemoryItem.findMany({
      where: { id: { in: hits.map((h) => h.id) }, organizationId, enabled: true },
      select: { title: true, content: true },
    });
    return memoryAugmentation(items);
  } catch (err) {
    logError('chat.memory', err, { organizationId });
    return '';
  }
}

export async function listThreads(organizationId: string, processId: string, userId: string) {
  return prisma.chatThread.findMany({
    where: { organizationId, processId, userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

export async function getThreadMessages(organizationId: string, threadId: string, userId: string) {
  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, organizationId, userId },
  });
  if (!thread) throw new AppError('Conversa não encontrada.', { status: 404, expose: true });

  return prisma.aIMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: 'asc' },
    include: {
      citations: {
        select: {
          id: true,
          documentId: true,
          pageNumber: true,
          quote: true,
          document: { select: { title: true } },
        },
      },
    },
  });
}

export async function deleteThread(organizationId: string, threadId: string, userId: string) {
  const thread = await prisma.chatThread.findFirst({ where: { id: threadId, organizationId, userId } });
  if (!thread) throw new AppError('Conversa não encontrada.', { status: 404, expose: true });
  await prisma.chatThread.delete({ where: { id: threadId } });
}
