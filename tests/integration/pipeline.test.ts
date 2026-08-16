import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { processDocument } from '@/lib/documents/pipeline';
import { retrieve, retrieveProcessOverview } from '@/lib/rag/retriever';
import { buildContext } from '@/lib/rag/context';
import { runAnalysis } from '@/lib/intelligence/analysis';
import { askProcess } from '@/lib/intelligence/chat';
import { indexStats } from '@/lib/rag/vector-store';
import { attachDocument, createTestOrganization, createTestProcess, resetDatabase, type TestOrg } from './helpers';

/**
 * Percurso completo: PDF -> extração -> chunking -> embeddings -> RAG ->
 * análise -> citações. É o teste que garante que a promessa central do produto
 * (toda afirmação leva a uma página real) funciona de ponta a ponta.
 */

const PETITION = [
  `EXCELENTISSIMO SENHOR JUIZ DE DIREITO

MARIANA COSTA PEREIRA vem propor a presente ACAO DECLARATORIA DE INEXISTENCIA DE DEBITO em face de BANCO EXEMPLO FICTICIO S.A.

DOS FATOS

Em 12/01/2026 a autora identificou tres cobrancas de R$ 189,90 cada, totalizando R$ 569,70, sob a rubrica SERVICO DE PROTECAO PREMIUM, que jamais contratou.

A autora alega que a cobranca e integralmente indevida e que seu nome foi negativado em 02/02/2026 conforme extrato anexo.`,
  `DO DIREITO

Aplica-se o Codigo de Defesa do Consumidor. O onus de comprovar a contratacao e do fornecedor.

DOS PEDIDOS

Requer a declaracao de inexistencia do debito de R$ 569,70 e a condenacao ao pagamento de indenizacao por danos morais.

Goiania, 20 de fevereiro de 2026.`,
];

const ANSWER = [
  `CONTESTACAO

O reu vem apresentar contestacao.

PRELIMINARMENTE

Suscita ilegitimidade passiva, pois o servico e operado por empresa parceira.

NO MERITO

A contratacao ocorreu em 05/12/2025 pelo aplicativo. Os lancamentos impugnados totalizam R$ 549,00, e nao o valor indicado na inicial, o que demonstra a imprecisao da narrativa autoral.

A autora nao comprovou o alegado indeferimento de financiamento estudantil. Nao ha nos autos qualquer documento nesse sentido.`,
];

let org: TestOrg;
let processId: string;
let petitionId: string;

beforeAll(async () => {
  await resetDatabase();
  org = await createTestOrganization('Pipeline');
  const process = await createTestProcess(org);
  processId = process.id;

  const petition = await attachDocument(org, processId, 'Peticao inicial', PETITION, 'INITIAL_PETITION');
  const answer = await attachDocument(org, processId, 'Contestacao', ANSWER, 'ANSWER');
  petitionId = petition.id;

  await processDocument(petition.id);
  await processDocument(answer.id);
}, 180_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ingestão de documentos', () => {
  it('extrai o texto preservando a separação por página', async () => {
    const pages = await prisma.documentPage.findMany({
      where: { documentId: petitionId },
      orderBy: { pageNumber: 'asc' },
    });

    expect(pages).toHaveLength(2);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].text).toContain('MARIANA COSTA PEREIRA');
    expect(pages[1].text).toContain('DOS PEDIDOS');
    // O conteúdo da página 2 não pode vazar para a página 1.
    expect(pages[0].text).not.toContain('DOS PEDIDOS');
  });

  it('marca o documento como indexado e conta as páginas', async () => {
    const document = await prisma.document.findUniqueOrThrow({ where: { id: petitionId } });
    expect(document.status).toBe('INDEXED');
    expect(document.pageCount).toBe(2);
    expect(document.extractionMethod).toBe('NATIVE_TEXT');
    expect(document.charCount).toBeGreaterThan(200);
  });

  it('gera chunks ancorados na página de origem', async () => {
    const chunks = await prisma.documentChunk.findMany({ where: { documentId: petitionId } });
    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      expect([1, 2]).toContain(chunk.pageNumber);
      expect(chunk.pageId).not.toBeNull();
    }
  });

  it('grava os embeddings de todos os chunks', async () => {
    const stats = await indexStats(org.organizationId);
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.pending).toBe(0);
  });

  it('é idempotente: reprocessar não duplica páginas nem chunks', async () => {
    const before = await prisma.documentChunk.count({ where: { documentId: petitionId } });
    await processDocument(petitionId);
    const after = await prisma.documentChunk.count({ where: { documentId: petitionId } });
    expect(after).toBe(before);
  });
});

describe('recuperação (RAG)', () => {
  it('encontra o trecho relevante para uma pergunta', async () => {
    const hits = await retrieve({
      organizationId: org.organizationId,
      processId,
      query: 'qual o valor da cobrança indevida',
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.content.includes('569,70'))).toBe(true);
  });

  it('a visão geral cobre todos os documentos do processo', async () => {
    const chunks = await retrieveProcessOverview(org.organizationId, processId, 40);
    const documents = new Set(chunks.map((chunk) => chunk.documentId));
    expect(documents.size).toBe(2);
  });

  it('o contexto montado expõe refs resolvíveis com página correta', async () => {
    const hits = await retrieve({
      organizationId: org.organizationId,
      processId,
      query: 'pedidos da inicial',
    });
    const context = buildContext(hits);

    expect(context.blocks.length).toBeGreaterThan(0);
    for (const block of context.blocks) {
      expect(block.ref).toMatch(/^D\d+:p\d+:c\d+$/);
      expect(context.byRef.get(block.ref)?.pageNumber).toBe(block.chunk.pageNumber);
    }
  });
});

describe('análises', () => {
  it('gera resumo e preenche o estado do processo', async () => {
    const result = await runAnalysis({
      organizationId: org.organizationId,
      processId,
      type: 'PROCESS_SUMMARY',
    });
    expect(result.demo).toBe(true); // provedor local nos testes

    const process = await prisma.process.findUniqueOrThrow({ where: { id: processId } });
    expect(process.executiveSummary).toBeTruthy();
    expect(process.lastAnalyzedAt).not.toBeNull();
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(process.riskLevel);
  });

  it('monta a linha do tempo a partir de datas realmente citadas', async () => {
    await runAnalysis({ organizationId: org.organizationId, processId, type: 'TIMELINE' });

    const events = await prisma.timelineEvent.findMany({ where: { processId } });
    expect(events.length).toBeGreaterThan(0);

    const dates = events.map((event) => event.occurredAt.toISOString().slice(0, 10));
    expect(dates).toContain('2026-01-12');
  });

  it('detecta a divergência de valor entre inicial e contestação', async () => {
    await runAnalysis({ organizationId: org.organizationId, processId, type: 'CONTRADICTIONS' });

    const contradictions = await prisma.finding.findMany({
      where: { processId, type: 'CONTRADICTION' },
      include: { citations: true },
    });

    expect(contradictions.length).toBeGreaterThan(0);
    expect(contradictions.some((item) => item.title.includes('549') && item.title.includes('569'))).toBe(
      true,
    );

    // Regra de produto: uma contradição só aparece com OS DOIS lados citáveis.
    for (const contradiction of contradictions) {
      expect(contradiction.citations.length).toBe(2);
      for (const citation of contradiction.citations) {
        expect(citation.pageNumber).toBeGreaterThan(0);
        expect(citation.documentId).toBeTruthy();
      }
    }
  });

  it('aponta alegações sem lastro documental', async () => {
    await runAnalysis({ organizationId: org.organizationId, processId, type: 'EVIDENCE_MAP' });

    const gaps = await prisma.finding.findMany({ where: { processId, type: 'EVIDENCE_GAP' } });
    expect(gaps.length).toBeGreaterThan(0);
  });

  it('toda citação criada aponta para um chunk que existe de verdade', async () => {
    const citations = await prisma.citation.findMany({
      where: { organizationId: org.organizationId },
      take: 200,
    });
    expect(citations.length).toBeGreaterThan(0);

    for (const citation of citations) {
      if (!citation.chunkId) continue;
      const chunk = await prisma.documentChunk.findUnique({ where: { id: citation.chunkId } });
      expect(chunk).not.toBeNull();
      expect(chunk?.pageNumber).toBe(citation.pageNumber);
      expect(chunk?.organizationId).toBe(org.organizationId);
    }
  });

  it('registra o consumo de IA de cada operação', async () => {
    const usage = await prisma.aIUsage.findMany({ where: { organizationId: org.organizationId } });
    expect(usage.length).toBeGreaterThan(0);
    // Provedor local não gera custo externo nem consome crédito.
    expect(usage.every((row) => row.provider === 'local')).toBe(true);
    expect(usage.every((row) => row.estimatedCostUsd === 0)).toBe(true);
  });
});

describe('chat contextual', () => {
  it('responde citando trechos existentes e registra a mensagem', async () => {
    const response = await askProcess({
      organizationId: org.organizationId,
      processId,
      userId: org.userId,
      question: 'Qual valor a autora afirma ter sido cobrado indevidamente?',
    });

    expect(response.content.length).toBeGreaterThan(20);
    expect(response.demo).toBe(true);
    expect(response.droppedRefs).toHaveLength(0);

    const messages = await prisma.aIMessage.findMany({ where: { threadId: response.threadId } });
    expect(messages).toHaveLength(2); // pergunta + resposta
  });

  it('admite quando a informação não está nos documentos', async () => {
    const response = await askProcess({
      organizationId: org.organizationId,
      processId,
      userId: org.userId,
      question: 'Qual foi o resultado do julgamento do recurso especial interposto?',
    });

    expect(response.content).toMatch(/não foi possível identificar|não contém os termos/i);
  });
});
