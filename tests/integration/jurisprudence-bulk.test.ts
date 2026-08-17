import { describe, expect, it, beforeAll } from 'vitest';
import { bulkImportJurisprudence } from '@/server/jurisprudence-bulk';
import { searchLegal } from '@/server/legal-search';
import { prisma } from '@/lib/db';
import { createTestOrganization, resetDatabase } from './helpers';

/**
 * Importação de ementas em lote — o caminho que faz o buscador ter conteúdo.
 *
 * O teste vai até o fim: importa uma planilha e depois PESQUISA, porque
 * importar sem ficar pesquisável seria o mesmo que não importar.
 */

const PLANILHA = [
  'Tribunal,Órgão julgador,Número do processo,Data,Relator,Ementa,Tese,Resultado,URL,Fonte',
  'TJGO,3ª Câmara Cível,0801234-56.2026.8.09.0051,11/03/2026,Des. Fulano,"Cobrança indevida de serviço não contratado em fatura de cartão. Inscrição em cadastro restritivo. Ônus da prova da contratação atribuído ao fornecedor.",Cabe ao fornecedor provar a contratação,Provimento parcial,https://tjgo.jus.br/exemplo-1,Portal do TJGO',
  'TJSP,12ª Câmara,1001234-56.2025.8.26.0100,2025-08-20,Des. Beltrano,"Dano moral. Necessidade de demonstração do abalo concreto quando a inscrição é posteriormente cancelada pelo próprio credor.",Abalo concreto deve ser demonstrado,Improcedente,https://tjsp.jus.br/exemplo-2,Portal do TJSP',
].join('\n');

describe('importação de ementas em lote', () => {
  let organizationId: string;

  beforeAll(async () => {
    await resetDatabase();
    const org = await createTestOrganization();
    organizationId = org.organizationId;
  });

  it('a conferência não grava nada', async () => {
    const previa = await bulkImportJurisprudence(organizationId, PLANILHA, { dryRun: true });

    expect(previa.totalRows).toBe(2);
    expect(previa.valid).toBe(2);
    expect(previa.imported).toBe(0);
    expect(previa.missingColumns).toEqual([]);
    expect(await prisma.jurisprudence.count({ where: { organizationId } })).toBe(0);
  });

  it('importa a planilha e grava os campos certos', async () => {
    const relatorio = await bulkImportJurisprudence(organizationId, PLANILHA);

    expect(relatorio.imported).toBe(2);
    expect(relatorio.errors).toEqual([]);

    const gravada = await prisma.jurisprudence.findFirst({
      where: { organizationId, court: 'TJGO' },
    });

    expect(gravada?.caseNumber).toBe('0801234-56.2026.8.09.0051');
    expect(gravada?.sourceUrl).toBe('https://tjgo.jus.br/exemplo-1');
    expect(gravada?.summary).toContain('Ônus da prova');
    expect(gravada?.isDemo).toBe(false);
    expect(gravada?.verified).toBe(true);
    // Data em formato brasileiro entendida como 11/03/2026.
    expect(gravada?.judgmentDate?.toISOString().slice(0, 10)).toBe('2026-03-11');
  });

  it('a ementa importada aparece na busca', async () => {
    const resultado = await searchLegal(organizationId, 'cobrança indevida cartão');

    expect(resultado.entendimentos.length).toBeGreaterThan(0);
    expect(resultado.entendimentos.some((e) => e.court === 'TJGO')).toBe(true);
    // Sem includeDemo e vindo da planilha: nada de fictício aqui.
    expect(resultado.entendimentos.every((e) => !e.isDemo)).toBe(true);
  });

  it('reimportar não duplica', async () => {
    const relatorio = await bulkImportJurisprudence(organizationId, PLANILHA);

    expect(relatorio.imported).toBe(0);
    expect(relatorio.duplicates).toBe(2);
    expect(await prisma.jurisprudence.count({ where: { organizationId } })).toBe(2);
  });

  it('recusa linha sem fonte, dizendo a linha e o motivo', async () => {
    const semFonte = [
      'Tribunal,Número do processo,Ementa,URL,Fonte',
      'TJMG,0009999-11.2026.8.13.0024,"Ementa suficientemente longa para passar na validação de tamanho mínimo.",,',
    ].join('\n');

    const relatorio = await bulkImportJurisprudence(organizationId, semFonte, { dryRun: true });

    expect(relatorio.valid).toBe(0);
    expect(relatorio.errors.length).toBeGreaterThan(0);
    expect(relatorio.errors[0].line).toBe(2);
    expect(relatorio.errors.map((e) => e.field)).toContain('sourceUrl');
  });

  it('aponta cabeçalho incompleto em vez de importar pela metade', async () => {
    const relatorio = await bulkImportJurisprudence(
      organizationId,
      ['Tribunal,Ementa', 'TJRS,Texto qualquer que seja longo o bastante para validar.'].join('\n'),
      { dryRun: true },
    );

    expect(relatorio.missingColumns).toContain('caseNumber');
    expect(relatorio.missingColumns).toContain('sourceUrl');
    expect(relatorio.valid).toBe(0);
  });
});
