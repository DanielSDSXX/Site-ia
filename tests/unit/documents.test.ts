import { describe, expect, it } from 'vitest';
import { chunkPages } from '@/lib/documents/chunk';
import { classifyDocument, guessDocumentDate } from '@/lib/documents/classify';
import { paginateText } from '@/lib/documents/extract';
import { verifyMagicNumber } from '@/server/documents';
import { extractDates, extractMoney, splitSentences, tokenize } from '@/lib/text/nlp';
import { embedLocal } from '@/lib/ai/providers/local';
import { cosineSimilarity, VECTOR_DIMENSIONS } from '@/lib/ai/types';

describe('chunking', () => {
  it('nunca cruza a fronteira entre páginas', () => {
    const chunks = chunkPages([
      { pageNumber: 1, text: 'Primeira página. '.repeat(200), needsOcr: false },
      { pageNumber: 2, text: 'Segunda página. '.repeat(200), needsOcr: false },
    ]);

    for (const chunk of chunks) {
      const source = chunk.pageNumber === 1 ? 'Primeira' : 'Segunda';
      expect(chunk.content).toContain(source);
    }
    expect(new Set(chunks.map((c) => c.pageNumber))).toEqual(new Set([1, 2]));
  });

  it('numera os chunks sequencialmente ao longo do documento', () => {
    const chunks = chunkPages([
      { pageNumber: 1, text: 'Texto da primeira página com conteúdo suficiente.', needsOcr: false },
      { pageNumber: 2, text: 'Texto da segunda página com conteúdo suficiente.', needsOcr: false },
    ]);
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1]);
  });

  it('ignora páginas vazias', () => {
    const chunks = chunkPages([
      { pageNumber: 1, text: '', needsOcr: true },
      { pageNumber: 2, text: 'Conteúdo real desta página do processo.', needsOcr: false },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageNumber).toBe(2);
  });

  it('divide páginas longas em vários chunks', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Esta é a frase número ${i} do documento.`).join(' ');
    const chunks = chunkPages([{ pageNumber: 1, text: long, needsOcr: false }], {
      targetChars: 300,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.pageNumber === 1)).toBe(true);
  });
});

describe('classificação de peças', () => {
  it('identifica petição inicial', () => {
    const result = classifyDocument(
      'EXCELENTÍSSIMO SENHOR JUIZ. A autora vem propor a presente ação. DOS FATOS. DO DIREITO. DOS PEDIDOS. Requer a citação do réu. Valor da causa: R$ 1.000,00.',
    );
    expect(result.kind).toBe('INITIAL_PETITION');
  });

  it('identifica contestação', () => {
    const result = classifyDocument(
      'O réu vem apresentar CONTESTAÇÃO. Preliminarmente, suscita ilegitimidade passiva. No mérito, impugna os pedidos e requer a improcedência.',
    );
    expect(result.kind).toBe('ANSWER');
  });

  it('identifica sentença', () => {
    const result = classifyDocument(
      'SENTENÇA. Ante o exposto, julgo procedente o pedido e condeno o réu. Publique-se. Registre-se. Intimem-se. Resolvo o mérito.',
    );
    expect(result.kind).toBe('SENTENCE');
  });

  it('devolve UNKNOWN quando a evidência é fraca — não chuta', () => {
    const result = classifyDocument('Bom dia. Segue em anexo o arquivo solicitado. Atenciosamente.');
    expect(result.kind).toBe('UNKNOWN');
  });

  it('extrai a data de fecho da peça', () => {
    const date = guessDocumentDate('...pede deferimento.\n\nGoiânia, 20 de fevereiro de 2026.');
    expect(date?.toISOString().slice(0, 10)).toBe('2026-02-20');
  });
});

describe('paginação de texto corrido', () => {
  it('quebra em páginas estimadas respeitando parágrafos', () => {
    const text = Array.from({ length: 10 }, (_, i) => `Parágrafo ${i}. `.repeat(40)).join('\n\n');
    const pages = paginateText(text, 1000);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].pageNumber).toBe(1);
  });

  it('sempre devolve ao menos uma página', () => {
    expect(paginateText('', 1000)).toHaveLength(1);
  });
});

describe('validação de upload', () => {
  it('aceita PDF com assinatura correta', () => {
    expect(verifyMagicNumber(Buffer.from('%PDF-1.7\n...'), 'application/pdf')).toBe(true);
  });

  it('rejeita arquivo que mente sobre o próprio tipo', () => {
    expect(verifyMagicNumber(Buffer.from('MZ\x90\x00 executável'), 'application/pdf')).toBe(false);
  });

  it('aceita PNG e JPEG pela assinatura binária', () => {
    expect(verifyMagicNumber(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]), 'image/png')).toBe(true);
    expect(verifyMagicNumber(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBe(true);
  });

  it('rejeita texto com bytes nulos (binário disfarçado)', () => {
    expect(verifyMagicNumber(Buffer.from([0x41, 0x00, 0x42]), 'text/plain')).toBe(false);
  });
});

describe('extração de entidades', () => {
  it('extrai valores em formato brasileiro', () => {
    const values = extractMoney('cobranças de R$ 189,90 cada, totalizando R$ 569,70.');
    expect(values.map((v) => v.cents)).toEqual([18990, 56970]);
  });

  it('extrai datas numéricas e por extenso', () => {
    const dates = extractDates('Em 12/01/2026 e também em 20 de fevereiro de 2026.');
    const iso = dates.map((d) => d.date.toISOString().slice(0, 10));
    expect(iso).toContain('2026-01-12');
    expect(iso).toContain('2026-02-20');
  });

  it('não quebra frases em abreviações jurídicas', () => {
    const sentences = splitSentences(
      'Aplica-se o art. 373, inciso II, do CPC ao presente caso concreto. A prova compete ao fornecedor do serviço.',
    );
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain('art. 373');
  });

  it('preserva separadores decimais ao segmentar frases', () => {
    const sentences = splitSentences(
      'O valor cobrado indevidamente foi de R$ 1.234,56 conforme o extrato juntado aos autos.',
    );
    expect(sentences[0]).toContain('1.234,56');
  });

  it('remove stopwords na tokenização', () => {
    expect(tokenize('a autora e o réu do processo')).not.toContain('de');
  });
});

describe('embeddings locais', () => {
  it('produz vetores com a dimensão canônica e normalizados', () => {
    const vector = embedLocal('cobrança indevida em cartão de crédito');
    expect(vector).toHaveLength(VECTOR_DIMENSIONS);

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('é determinístico', () => {
    expect(embedLocal('mesmo texto')).toEqual(embedLocal('mesmo texto'));
  });

  it('aproxima textos parecidos mais que textos distintos', () => {
    const a = embedLocal('cobrança indevida no cartão de crédito da autora');
    const b = embedLocal('cobrança indevida lançada no cartão de crédito');
    const c = embedLocal('perícia de engenharia em imóvel rural com laudo técnico');

    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  });
});
