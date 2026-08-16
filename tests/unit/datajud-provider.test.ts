import { describe, expect, it } from 'vitest';
import {
  buildDatajudSearchBody,
  normalizeDatajudProcess,
  resolveDatajudIndex,
  toCnjDigits,
} from '@/lib/integrations/datajud';

/**
 * Cliente da API Pública do CNJ (DataJud).
 *
 * Os campos seguem o glossário oficial da API. Estes testes fixam o que
 * quebrava a integração:
 *  1. `index` não pode ir no corpo da busca — o Elasticsearch rejeita;
 *  2. os campos consultados precisam ser os que o DataJud realmente indexa
 *     (classe, assuntos, órgão julgador, movimentos), e não `ementa`/`texto`,
 *     que não existem neste índice;
 *  3. `@timestamp` não está no glossário, então a ordenação precisa tolerar
 *     o campo ausente do mapeamento;
 *  4. em busca textual a relevância vem antes da cronologia.
 */
describe('Datajud — corpo da consulta', () => {
  it('não envia "index" no corpo: o índice vai na URL', () => {
    const body = buildDatajudSearchBody('cobrança indevida', 8);

    expect(body).not.toHaveProperty('index');
    expect(body.size).toBe(8);
  });

  it('ordena por relevância na busca textual, com a data só como desempate', () => {
    const body = buildDatajudSearchBody('cobrança indevida', 8);

    expect(body.sort).toEqual([
      { _score: { order: 'desc' } },
      { '@timestamp': { order: 'asc', unmapped_type: 'date' } },
    ]);
  });

  it('tolera índices sem @timestamp no mapeamento', () => {
    const textual = buildDatajudSearchBody('execução fiscal', 5) as { sort: object[] };
    const byNumber = buildDatajudSearchBody('00008323520184013202', 5) as { sort: object[] };

    for (const sort of [...textual.sort, ...byNumber.sort]) {
      const clause = (sort as Record<string, Record<string, unknown>>)['@timestamp'];
      if (clause) expect(clause.unmapped_type).toBe('date');
    }
  });

  it('usa busca exata por número quando a query é um CNJ de 20 dígitos', () => {
    const body = buildDatajudSearchBody('00008323520184013202', 10);
    expect(body.query).toMatchObject({ match: { numeroProcesso: '00008323520184013202' } });
    // Um número só devolve um processo: aqui a cronologia basta.
    expect(body.sort).toEqual([{ '@timestamp': { order: 'asc', unmapped_type: 'date' } }]);
  });

  it('aceita o número CNJ com máscara e consulta apenas os dígitos', () => {
    const body = buildDatajudSearchBody('0000832-35.2018.4.01.3202', 10);
    expect(body.query).toMatchObject({ match: { numeroProcesso: '00008323520184013202' } });
  });

  it('consulta os campos que o DataJud realmente indexa', () => {
    const body = buildDatajudSearchBody('execução fiscal', 5) as {
      query: { bool: { should: Record<string, unknown>[] } };
    };

    const fields = body.query.bool.should.flatMap((clause) =>
      Object.values(clause).flatMap((value) => Object.keys(value as object)),
    );

    expect(fields).toContain('classe.nome');
    expect(fields).toContain('assuntos.nome');
    expect(fields).toContain('movimentos.nome');
    // Campos inexistentes neste índice não devem ser consultados.
    expect(fields).not.toContain('ementa');
    expect(fields).not.toContain('relator');
  });

  it('busca o tribunal com match: "term" não casa com o campo analisado', () => {
    const body = buildDatajudSearchBody('TJSP', 5) as {
      query: { bool: { should: Record<string, unknown>[] } };
    };

    expect(body.query.bool.should.some((clause) => 'term' in clause)).toBe(false);
    expect(body.query.bool.should).toContainEqual({ match: { tribunal: 'TJSP' } });
  });

  it('limita o tamanho da página ao máximo aceito pela API', () => {
    expect(buildDatajudSearchBody('teste', 5000).size).toBe(100);
    expect(buildDatajudSearchBody('teste', 0).size).toBe(1);
  });
});

describe('Datajud — normalização', () => {
  it('mapeia o formato real da API para o modelo interno', () => {
    const process = normalizeDatajudProcess(
      {
        _id: 'abc123',
        _index: 'api_publica_tjgo',
        _source: {
          numeroProcesso: '00008323520184013202',
          tribunal: 'TJGO',
          grau: 'G1',
          classe: { codigo: 1116, nome: 'Execução Fiscal' },
          assuntos: [{ codigo: 5952, nome: 'Dívida Ativa' }],
          orgaoJulgador: { codigo: 1234, nome: '3ª Vara Cível', codigoMunicipioIBGE: 5208707 },
          sistema: { codigo: 1, nome: 'PJe' },
          formato: { codigo: 1, nome: 'Eletrônico' },
          nivelSigilo: 0,
          dataAjuizamento: '2018-05-02T00:00:00.000Z',
          '@timestamp': '2026-01-10T12:00:00.000Z',
          movimentos: [
            { codigo: 26, nome: 'Distribuição', dataHora: '2018-05-02T10:00:00.000Z' },
            { codigo: 246, nome: 'Sentença', dataHora: '2020-03-11T14:30:00.000Z' },
          ],
        },
      },
      'api_publica_tjgo',
    );

    expect(process.caseNumber).toBe('0000832-35.2018.4.01.3202');
    expect(process.caseNumberDigits).toBe('00008323520184013202');
    expect(process.court).toBe('TJGO');
    expect(process.degree).toBe('G1');
    expect(process.procedureClass).toBe('Execução Fiscal');
    expect(process.subjects).toEqual(['Dívida Ativa']);
    expect(process.judgingBody).toBe('3ª Vara Cível');
    expect(process.system).toBe('PJe');
    expect(process.format).toBe('Eletrônico');
    expect(process.filedAt?.toISOString()).toBe('2018-05-02T00:00:00.000Z');
    expect(process.sourceName).toContain('CNJ DataJud');
  });

  it('ordena as movimentações da mais antiga para a mais recente', () => {
    const process = normalizeDatajudProcess({
      _index: 'api_publica_tjgo',
      _source: {
        numeroProcesso: '00008323520184013202',
        movimentos: [
          { codigo: 246, nome: 'Sentença', dataHora: '2020-03-11T14:30:00.000Z' },
          { codigo: 26, nome: 'Distribuição', dataHora: '2018-05-02T10:00:00.000Z' },
        ],
      },
    });

    expect(process.movements.map((m) => m.name)).toEqual(['Distribuição', 'Sentença']);
  });

  it('não inventa dados: campos ausentes ficam nulos', () => {
    const process = normalizeDatajudProcess({
      _index: 'api_publica_tjgo',
      _source: { numeroProcesso: '00008323520184013202' },
    });

    expect(process.procedureClass).toBeNull();
    expect(process.judgingBody).toBeNull();
    expect(process.subjects).toEqual([]);
    expect(process.movements).toEqual([]);
  });

  it('lê os complementos tabelados no formato do glossário', () => {
    // Glossário: `descricao` é o nome da variável e `nome` é o texto do valor.
    // `valor` é um CÓDIGO numérico — imprimi-lo mostraria um número sem sentido.
    const process = normalizeDatajudProcess({
      _source: {
        numeroProcesso: '00008323520184013202',
        movimentos: [
          {
            codigo: 123,
            nome: 'Julgamento',
            dataHora: '2020-03-11T14:30:00.000Z',
            complementosTabelados: [
              { codigo: 3, descricao: 'tipo_de_decisao', valor: 7, nome: 'Com resolução do mérito' },
            ],
          },
        ],
      },
    });

    expect(process.movements[0].complements).toEqual([
      'tipo_de_decisao: Com resolução do mérito',
    ]);
  });

  it('lê o órgão julgador do próprio movimento', () => {
    const process = normalizeDatajudProcess({
      _source: {
        numeroProcesso: '00008323520184013202',
        orgaoJulgador: { codigo: 1234, nome: '3ª Vara Cível' },
        movimentos: [
          {
            codigo: 246,
            nome: 'Remessa',
            dataHora: '2020-03-11T14:30:00.000Z',
            orgaoJulgador: { codigoOrgao: 99, nomeOrgao: '1ª Câmara Cível' },
          },
        ],
      },
    });

    expect(process.movements[0].judgingBody).toBe('1ª Câmara Cível');
  });
});

describe('Datajud — índices e número CNJ', () => {
  it('resolve a sigla do tribunal para o índice do CNJ', () => {
    expect(resolveDatajudIndex('tjsp')).toBe('api_publica_tjsp');
    expect(resolveDatajudIndex('TRF1')).toBe('api_publica_trf1');
  });

  it('aceita o nome do índice já completo', () => {
    expect(resolveDatajudIndex('api_publica_stj')).toBe('api_publica_stj');
  });

  it('extrai os 20 dígitos do número CNJ', () => {
    expect(toCnjDigits('0000832-35.2018.4.01.3202')).toBe('00008323520184013202');
    expect(toCnjDigits('123')).toBeNull();
  });
});
