import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { processDocument } from '@/lib/documents/pipeline';
import { runAnalysis } from '@/lib/intelligence/analysis';
import { attachDocument, createTestOrganization, createTestProcess, resetDatabase, type TestOrg } from './helpers';

/**
 * Reexecutar uma análise substitui a anterior do mesmo tipo.
 *
 * A interface sempre exibe a análise mais recente de cada tipo. Se os achados
 * antigos permanecessem, a tela mostraria o mesmo problema várias vezes e o
 * contador do processo cresceria a cada clique.
 */

let org: TestOrg;
let processId: string;

beforeAll(async () => {
  await resetDatabase();
  org = await createTestOrganization('Reanálise');
  const process = await createTestProcess(org);
  processId = process.id;

  const document = await attachDocument(
    org,
    processId,
    'Peticao',
    [
      'PETICAO INICIAL. A autora alega que houve cobranca indevida de R$ 850,00 em 10/01/2026 e requer a condenacao da re ao pagamento de indenizacao por danos morais, conforme extrato anexo.',
    ],
    'INITIAL_PETITION',
  );
  await processDocument(document.id);
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('reexecução de análise', () => {
  it('não acumula achados ao rodar o mesmo tipo duas vezes', async () => {
    await runAnalysis({ organizationId: org.organizationId, processId, type: 'VULNERABILITIES' });
    const first = await prisma.finding.count({ where: { processId, type: 'VULNERABILITY' } });
    expect(first).toBeGreaterThan(0);

    await runAnalysis({ organizationId: org.organizationId, processId, type: 'VULNERABILITIES' });
    const second = await prisma.finding.count({ where: { processId, type: 'VULNERABILITY' } });

    expect(second).toBe(first);
  });

  it('preserva o histórico de execuções em ai_analyses', async () => {
    const analyses = await prisma.aIAnalysis.findMany({
      where: { processId, type: 'VULNERABILITIES', status: 'COMPLETED' },
    });
    expect(analyses.length).toBeGreaterThanOrEqual(2);
  });

  it('não remove achados de outros tipos de análise', async () => {
    await runAnalysis({ organizationId: org.organizationId, processId, type: 'NEXT_ACTIONS' });
    const actions = await prisma.finding.count({ where: { processId, type: 'STRATEGIC_ACTION' } });
    expect(actions).toBeGreaterThan(0);

    await runAnalysis({ organizationId: org.organizationId, processId, type: 'VULNERABILITIES' });

    const stillThere = await prisma.finding.count({ where: { processId, type: 'STRATEGIC_ACTION' } });
    expect(stillThere).toBe(actions);
  });

  it('as citações da execução anterior somem junto com os achados', async () => {
    const orphans = await prisma.citation.findMany({
      where: {
        organizationId: org.organizationId,
        findingId: { not: null },
        finding: null,
      },
    });
    expect(orphans).toHaveLength(0);
  });
});
