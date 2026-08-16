import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { listProcesses, getProcessDetail, softDeleteProcess, updateProcess } from '@/server/processes';
import { getDocument, getDocumentContent, listDocuments, softDeleteDocument } from '@/server/documents';
import { listClients, listDeadlines, listTasks, updateTask } from '@/server/workspace';
import { globalSearch } from '@/server/dashboard';
import { retrieve } from '@/lib/rag/retriever';
import { runAnalysis } from '@/lib/intelligence/analysis';
import { askProcess } from '@/lib/intelligence/chat';
import { NotFoundError } from '@/lib/errors';
import { attachDocument, createTestOrganization, createTestProcess, resetDatabase, type TestOrg } from './helpers';
import { processDocument } from '@/lib/documents/pipeline';

/**
 * Isolamento entre organizações.
 *
 * Este é o teste mais importante da suíte: num SaaS jurídico, um vazamento
 * entre escritórios é catastrófico. Cada caminho de leitura é exercitado com
 * o ID de OUTRA organização e precisa falhar.
 */

let alpha: TestOrg;
let beta: TestOrg;
let alphaProcessId: string;
let betaProcessId: string;
let alphaDocumentId: string;

beforeAll(async () => {
  await resetDatabase();

  alpha = await createTestOrganization('Alpha');
  beta = await createTestOrganization('Beta');

  const alphaProcess = await createTestProcess(alpha, '0801234-56.2026.8.09.0051');
  const betaProcess = await createTestProcess(beta, '0807654-32.2026.8.09.0051');
  alphaProcessId = alphaProcess.id;
  betaProcessId = betaProcess.id;

  const document = await attachDocument(
    alpha,
    alphaProcessId,
    'Peticao Alpha',
    [
      'PETICAO INICIAL CONFIDENCIAL DA ALPHA. A autora alega cobranca indevida no valor de R$ 1.500,00 conforme extrato anexo. Requer a condenacao da re ao pagamento de indenizacao por danos morais.',
    ],
    'INITIAL_PETITION',
  );
  alphaDocumentId = document.id;

  await processDocument(alphaDocumentId);

  await prisma.client.create({
    data: { organizationId: alpha.organizationId, name: 'Cliente Secreto Alpha' },
  });
  await prisma.task.create({
    data: { organizationId: alpha.organizationId, title: 'Tarefa Alpha', processId: alphaProcessId },
  });
  await prisma.deadline.create({
    data: {
      organizationId: alpha.organizationId,
      processId: alphaProcessId,
      title: 'Prazo Alpha',
      dueDate: new Date(Date.now() + 86_400_000),
    },
  });
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('isolamento de processos', () => {
  it('lista apenas os processos da própria organização', async () => {
    const result = await listProcesses(beta.organizationId, {
      page: 1,
      pageSize: 25,
      sort: 'recent',
    });

    expect(result.items.map((item) => item.id)).toEqual([betaProcessId]);
    expect(result.items.map((item) => item.id)).not.toContain(alphaProcessId);
  });

  it('impede abrir o processo de outra organização', async () => {
    await expect(getProcessDetail(beta.organizationId, alphaProcessId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('impede alterar o processo de outra organização', async () => {
    await expect(
      updateProcess(beta.organizationId, alphaProcessId, { subject: 'invadido' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const untouched = await prisma.process.findUnique({ where: { id: alphaProcessId } });
    expect(untouched?.subject).toBe('Cobrança indevida');
  });

  it('impede excluir o processo de outra organização', async () => {
    await expect(softDeleteProcess(beta.organizationId, alphaProcessId)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const untouched = await prisma.process.findUnique({ where: { id: alphaProcessId } });
    expect(untouched?.deletedAt).toBeNull();
  });
});

describe('isolamento de documentos', () => {
  it('não lista documentos de outra organização', async () => {
    const result = await listDocuments(beta.organizationId);
    expect(result.items).toHaveLength(0);
  });

  it('impede ler os metadados do documento alheio', async () => {
    await expect(getDocument(beta.organizationId, alphaDocumentId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('impede baixar o conteúdo do documento alheio', async () => {
    await expect(getDocumentContent(beta.organizationId, alphaDocumentId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('impede excluir o documento alheio', async () => {
    await expect(softDeleteDocument(beta.organizationId, alphaDocumentId)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const untouched = await prisma.document.findUnique({ where: { id: alphaDocumentId } });
    expect(untouched?.deletedAt).toBeNull();
  });
});

describe('isolamento da recuperação semântica', () => {
  it('a busca RAG de uma organização nunca alcança trechos de outra', async () => {
    const alphaHits = await retrieve({
      organizationId: alpha.organizationId,
      processId: alphaProcessId,
      query: 'cobrança indevida extrato',
    });
    expect(alphaHits.length).toBeGreaterThan(0);

    const betaHits = await retrieve({
      organizationId: beta.organizationId,
      query: 'cobrança indevida extrato',
    });
    expect(betaHits).toHaveLength(0);
  });

  it('a busca global não retorna registros de outra organização', async () => {
    const results = await globalSearch(beta.organizationId, 'Alpha');
    expect(results).toHaveLength(0);

    const own = await globalSearch(alpha.organizationId, 'Alpha');
    expect(own.length).toBeGreaterThan(0);
  });
});

describe('isolamento da inteligência', () => {
  it('não executa análise sobre processo de outra organização', async () => {
    await expect(
      runAnalysis({
        organizationId: beta.organizationId,
        processId: alphaProcessId,
        type: 'PROCESS_SUMMARY',
      }),
    ).rejects.toThrow();
  });

  it('não responde no chat sobre processo de outra organização', async () => {
    await expect(
      askProcess({
        organizationId: beta.organizationId,
        processId: alphaProcessId,
        userId: beta.userId,
        question: 'Qual o valor cobrado?',
      }),
    ).rejects.toThrow();
  });
});

describe('isolamento do operacional', () => {
  it('não lista clientes, tarefas nem prazos de outra organização', async () => {
    expect(await listClients(beta.organizationId)).toHaveLength(0);
    expect(await listTasks(beta.organizationId)).toHaveLength(0);
    expect(await listDeadlines(beta.organizationId)).toHaveLength(0);

    expect(await listClients(alpha.organizationId)).toHaveLength(1);
  });

  it('impede alterar tarefa de outra organização', async () => {
    const task = await prisma.task.findFirstOrThrow({
      where: { organizationId: alpha.organizationId },
    });

    await expect(
      updateTask(beta.organizationId, task.id, { status: 'DONE' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
