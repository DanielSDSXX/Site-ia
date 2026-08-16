import { describe, expect, it } from 'vitest';
import { buildDatajudSearchBody, normalizeDatajudRecord } from '@/lib/jurisprudence/datajud';

describe('Datajud provider', () => {
  it('constrói a query Elasticsearch do índice do tribunal com paginação e sort', () => {
    const body = buildDatajudSearchBody('cobrança indevida', 8, 'api_publica_tjgo');

    expect(body).not.toHaveProperty('index');
    expect(body.size).toBe(8);
    expect(body.sort).toEqual([{ '@timestamp': { order: 'asc' } }]);
    expect(body.query.bool.must[0]).toMatchObject({
      multi_match: { query: 'cobrança indevida', fields: expect.any(Array) },
    });
  });

  it('usa a busca exata por número do processo quando a query é um CNJ de 20 dígitos', () => {
    const body = buildDatajudSearchBody('00008323520184013202', 10, 'api_publica_trf1');

    expect(body.query).toMatchObject({
      match: {
        numeroProcesso: '00008323520184013202',
      },
    });
  });

  it('normaliza os metadados do tribunal para o modelo interno do projeto', () => {
    const record = normalizeDatajudRecord({
      _source: {
        tribunal: 'Tribunal de Justiça do Goiás',
        orgaoJulgador: '3ª Câmara Cível',
        numeroProcesso: '0801234-56.2026.8.09.0051',
        dataJulgamento: '2026-08-15T00:00:00Z',
        relator: 'Desembargador Fulano',
        ementa: 'Cobrança indevida. Dano moral.',
        url: 'https://www.tjgo.jus.br/decisao/123',
      },
    });

    expect(record).toMatchObject({
      court: 'Tribunal de Justiça do Goiás',
      judgingBody: '3ª Câmara Cível',
      caseNumber: '0801234-56.2026.8.09.0051',
      summary: 'Cobrança indevida. Dano moral.',
      sourceUrl: 'https://www.tjgo.jus.br/decisao/123',
      sourceName: 'Tribunal de Justiça do Goiás',
      verified: true,
      isDemo: false,
    });
  });
});
