import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseJurisprudenceTable } from '@/lib/jurisprudence/csv';
import { jurisprudenceImportSchema } from '@/lib/validation';

/**
 * Leitura de ementas em lote.
 *
 * Ementa é texto jurídico: tem vírgula, aspas e quebra de linha dentro. Um
 * `split(',')` picotaria a ementa e gravaria pedaços como se fossem colunas —
 * erro que só apareceria quando alguém citasse metade de um acórdão.
 */
describe('separador', () => {
  it('reconhece vírgula, ponto e vírgula e tabulação', () => {
    expect(detectDelimiter('tribunal,ementa,url')).toBe(',');
    expect(detectDelimiter('tribunal;ementa;url')).toBe(';');
    expect(detectDelimiter('tribunal\tementa\turl')).toBe('\t');
  });

  it('ignora separadores que estão dentro de aspas', () => {
    expect(detectDelimiter('"tribunal, comarca";ementa;url')).toBe(';');
  });
});

describe('leitura da planilha', () => {
  it('lê as colunas pelos nomes usados no escritório', () => {
    const { rows, headers } = parseJurisprudenceTable(
      ['Tribunal,Número do processo,Ementa,URL,Fonte', 'TJGO,0801234-56.2026.8.09.0051,Texto da ementa,https://tjgo.jus.br/x,Portal do TJGO'].join('\n'),
    );

    expect(headers).toContain('court');
    expect(headers).toContain('caseNumber');
    expect(headers).toContain('summary');
    expect(rows).toHaveLength(1);
    expect(rows[0].values.court).toBe('TJGO');
    expect(rows[0].values.sourceUrl).toBe('https://tjgo.jus.br/x');
    expect(rows[0].values.sourceName).toBe('Portal do TJGO');
  });

  it('não picota a ementa em vírgulas internas', () => {
    const { rows } = parseJurisprudenceTable(
      ['tribunal,ementa,url,fonte', 'TJGO,"Dano moral, cobrança indevida, inversão do ônus",https://x.br,TJGO'].join('\n'),
    );

    expect(rows[0].values.summary).toBe('Dano moral, cobrança indevida, inversão do ônus');
  });

  it('preserva quebras de linha dentro da ementa', () => {
    const texto = 'tribunal,ementa,url,fonte\nTJGO,"Primeira linha\nSegunda linha",https://x.br,TJGO';
    const { rows } = parseJurisprudenceTable(texto);

    expect(rows).toHaveLength(1);
    expect(rows[0].values.summary).toBe('Primeira linha\nSegunda linha');
  });

  it('entende aspas escapadas no padrão da planilha', () => {
    const { rows } = parseJurisprudenceTable(
      ['tribunal,ementa,url,fonte', 'TJGO,"O réu alega ""inexigibilidade"" do débito",https://x.br,TJGO'].join('\n'),
    );

    expect(rows[0].values.summary).toBe('O réu alega "inexigibilidade" do débito');
  });

  it('lê o formato colado do Excel (tabulação)', () => {
    const { rows, delimiter } = parseJurisprudenceTable(
      ['Tribunal\tEmenta\tURL\tFonte', 'TJSP\tTexto\thttps://x.br\tPortal'].join('\n'),
    );

    expect(delimiter).toBe('\t');
    expect(rows[0].values.court).toBe('TJSP');
  });

  it('reporta colunas desconhecidas em vez de descartá-las em silêncio', () => {
    const { unknownHeaders } = parseJurisprudenceTable(
      ['tribunal,ementa,url,fonte,observacao_interna', 'TJGO,Texto,https://x.br,Portal,nota'].join('\n'),
    );

    expect(unknownHeaders).toEqual(['observacao_interna']);
  });

  it('numera as linhas como na planilha, para o relatório de erros', () => {
    const { rows } = parseJurisprudenceTable(
      ['tribunal,ementa,url,fonte', 'A,x,https://a.br,F', 'B,y,https://b.br,F'].join('\n'),
    );

    expect(rows.map((r) => r.line)).toEqual([2, 3]);
  });

  it('descarta linhas em branco', () => {
    const { rows } = parseJurisprudenceTable(
      ['tribunal,ementa,url,fonte', 'A,x,https://a.br,F', '', ',,,'].join('\n'),
    );

    expect(rows).toHaveLength(1);
  });

  it('devolve vazio para entrada vazia, sem estourar', () => {
    expect(parseJurisprudenceTable('').rows).toEqual([]);
  });
});

describe('mensagens de validação', () => {
  it('fala português — nada de texto padrão do Zod na tela', () => {
    const resultado = jurisprudenceImportSchema.safeParse({
      court: 'TJGO',
      caseNumber: '0801234-56.2026.8.09.0051',
      summary: 'Ementa longa o suficiente para passar na validação de tamanho.',
      sourceUrl: '',
      sourceName: '',
    });

    expect(resultado.success).toBe(false);
    if (resultado.success) return;

    const mensagens = resultado.error.issues.map((i) => i.message).join(' | ');
    expect(mensagens).not.toMatch(/String must contain|Invalid|Required/);
    expect(mensagens).toContain('URL da fonte oficial');
    expect(mensagens).toContain('nome da fonte');
  });
});
