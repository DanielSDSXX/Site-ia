import { describe, expect, it } from 'vitest';
import { heuristicStructure } from '@/lib/intelligence/heuristics';
import type { HeuristicInput } from '@/lib/intelligence/heuristics';

/**
 * Extração de partes.
 *
 * Estes casos vêm de lixo REAL encontrado no banco depois de rodar a análise
 * sobre a petição de demonstração: 54 "partes" cadastradas, das quais duas
 * eram partes de verdade. O resto era pedaço de frase — "sponder", "gular",
 * "quer-se" — porque a alternativa `r[ée]` casava o "re" de qualquer palavra e
 * a flag `i` anulava a exigência de inicial maiúscula.
 *
 * Nome de parte vai para a ficha do processo. Não extrair é melhor que
 * extrair errado.
 */

function input(text: string): HeuristicInput {
  return {
    process: {
      number: '0801234-56.2026.8.09.0051',
      court: 'TJGO',
      subject: null,
      status: 'ACTIVE',
      ourSideName: null,
      opposingSideName: null,
      documentKinds: ['INITIAL_PETITION'],
      documentCount: 1,
      pagesWithoutText: 0,
      openDeadlines: [],
      lastDocumentDate: null,
    },
    context: {
      text,
      blocks: [
        {
          ref: 'D1:p1:c0',
          chunk: {
            id: 'chunk-1',
            documentId: 'doc-1',
            documentTitle: 'Petição inicial',
            documentKind: 'PETITION',
            pageNumber: 1,
            chunkIndex: 0,
            content: text,
            score: 1,
          },
        },
      ],
      byRef: new Map(),
      chunkIds: ['chunk-1'],
      truncated: false,
    } as unknown as HeuristicInput['context'],
  };
}

const names = (text: string) => heuristicStructure(input(text)).parties.map((p) => p.name);

describe('extração de partes', () => {
  it('extrai o nome que segue o termo do polo', () => {
    const found = names(
      'Autora: Mariana Costa Pereira, brasileira, solteira. Réu: Banco Exemplo Fictício S.A.',
    );

    expect(found).toContain('Mariana Costa Pereira');
    expect(found).toContain('Banco Exemplo Fictício S.A.');
  });

  it('não confunde o "re" de outras palavras com "réu"', () => {
    const found = names(
      'Cabe ao fornecedor responder pela cobrança. A restrição é irregular e deve ser cancelada.',
    );

    expect(found).toEqual([]);
  });

  it('não transforma texto corrido em nome de parte', () => {
    const found = names(
      'O autor nega a contratação do serviço cobrado e o réu não apresentou o instrumento contratual correspondente.',
    );

    // "nega a contratação..." não tem forma de nome próprio.
    expect(found).toEqual([]);
  });

  it('lê a autuação no formato "X em face de Y"', () => {
    const found = names(
      'Trata-se de ação proposta por Mariana Costa Pereira em face de Banco Exemplo Fictício S.A.',
    );

    expect(found[0]).toBe('Mariana Costa Pereira');
    expect(found[1]).toBe('Banco Exemplo Fictício S.A.');
  });

  it('descarta tratamento e órgão, que têm forma de nome mas não são parte', () => {
    const found = names(
      'Requer o autor Vossa Excelência o deferimento. Réu: Vara Cível da Comarca de Goiânia.',
    );

    expect(found).toEqual([]);
  });

  it('exige ao menos dois tokens: uma palavra solta não é nome', () => {
    expect(names('Réu: Banco')).toEqual([]);
  });

  it('não lê o nome da ação como se fosse o autor', () => {
    // Caso real da petição de demonstração: o texto antes de "em face de" é o
    // nome da ação, e virava a parte "DE DÉBITO CUMULADA COM INDENIZAÇÃO…".
    const found = names(
      'vem respeitosamente à presença de Vossa Excelência propor a presente AÇÃO DECLARATÓRIA DE INEXISTÊNCIA DE DÉBITO CUMULADA COM INDENIZAÇÃO POR DANOS MORAIS em face de BANCO EXEMPLO FICTÍCIO S.A.',
    );

    expect(found).toEqual(['BANCO EXEMPLO FICTÍCIO S.A.']);
  });

  it('descarta candidatos que começam por preposição', () => {
    expect(names('Réu: de Débito Cumulada Com Indenização')).toEqual([]);
  });

  it('lê o autor da abertura qualificada da inicial', () => {
    const found = names(
      'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA VARA CÍVEL. MARIANA COSTA PEREIRA, brasileira, analista administrativa, portadora do documento nº 00.000.000-0, vem propor a presente ação.',
    );

    expect(found).toContain('MARIANA COSTA PEREIRA');
  });

  it('lê o autor de "proposta por X"', () => {
    const found = names(
      'BANCO EXEMPLO FICTÍCIO S.A., já qualificado nos autos, vem apresentar CONTESTAÇÃO à ação declaratória proposta por MARIANA COSTA PEREIRA, pelas razões a seguir.',
    );

    expect(found).toContain('MARIANA COSTA PEREIRA');
    expect(found).toContain('BANCO EXEMPLO FICTÍCIO S.A.');
  });

  it('não repete a mesma parte encontrada em trechos diferentes', () => {
    const found = names(
      'Autora: Mariana Costa Pereira. Adiante, a autora Mariana Costa Pereira requer a tutela.',
    );

    expect(found.filter((name) => name === 'Mariana Costa Pereira')).toHaveLength(1);
  });
});
