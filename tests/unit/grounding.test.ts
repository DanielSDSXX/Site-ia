import { describe, expect, it } from 'vitest';
import { buildContext } from '@/lib/rag/context';
import type { RetrievedChunk } from '@/lib/rag/retriever';
import {
  adjustConfidence,
  extractInlineRefs,
  quoteAppearsInChunk,
  resolveRefs,
  stripInvalidRefs,
} from '@/lib/intelligence/grounding';

/**
 * O sistema anti-alucinação é a promessa central do produto. Estes testes
 * garantem que uma referência inventada pelo modelo nunca chegue à interface
 * como se fosse uma fonte real.
 */

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: 'chunk-1',
    documentId: 'doc-1',
    documentTitle: 'Petição inicial',
    documentKind: 'INITIAL_PETITION',
    pageId: 'page-1',
    pageNumber: 7,
    chunkIndex: 0,
    content:
      'A autora identificou o lançamento de três cobranças que não reconhece, no valor de R$ 189,90 cada.',
    score: 1,
    vectorScore: 0.8,
    textScore: 0.5,
    ...overrides,
  };
}

describe('montagem de contexto', () => {
  it('gera refs estáveis no formato D<doc>:p<página>:c<chunk>', () => {
    const context = buildContext([chunk()]);
    expect(context.blocks[0].ref).toBe('D1:p7:c0');
    expect(context.byRef.has('D1:p7:c0')).toBe(true);
  });

  it('numera documentos distintos em sequência', () => {
    const context = buildContext([
      chunk(),
      chunk({ id: 'chunk-2', documentId: 'doc-2', documentTitle: 'Contestação', pageNumber: 3 }),
    ]);
    expect(context.blocks.map((b) => b.ref)).toEqual(['D1:p7:c0', 'D2:p3:c0']);
  });

  it('marca truncamento quando o orçamento de caracteres estoura', () => {
    const long = chunk({ content: 'x'.repeat(5000) });
    const context = buildContext([long, chunk({ id: 'chunk-2' })], 1000);
    expect(context.truncated).toBe(true);
  });
});

describe('resolução de referências', () => {
  it('aceita refs existentes e devolve a citação com página', () => {
    const context = buildContext([chunk()]);
    const { valid, dropped } = resolveRefs(['D1:p7:c0'], context);

    expect(dropped).toHaveLength(0);
    expect(valid[0].pageNumber).toBe(7);
    expect(valid[0].documentId).toBe('doc-1');
  });

  it('DESCARTA refs inventados pelo modelo', () => {
    const context = buildContext([chunk()]);
    const { valid, dropped } = resolveRefs(['D1:p7:c0', 'D9:p99:c9'], context);

    expect(valid).toHaveLength(1);
    expect(dropped).toEqual(['D9:p99:c9']);
  });

  it('não duplica o mesmo ref citado duas vezes', () => {
    const context = buildContext([chunk()]);
    const { valid } = resolveRefs(['D1:p7:c0', 'D1:p7:c0'], context);
    expect(valid).toHaveLength(1);
  });
});

describe('limpeza de citações no texto livre', () => {
  it('remove do texto as referências que não existem', () => {
    const context = buildContext([chunk()]);
    const { text, dropped } = stripInvalidRefs(
      'A cobrança foi lançada três vezes [D1:p7:c0] e o réu negou [D7:p1:c4].',
      context,
    );

    expect(text).toContain('[D1:p7:c0]');
    expect(text).not.toContain('D7:p1:c4');
    expect(dropped).toContain('D7:p1:c4');
  });

  it('preserva as válidas quando um grupo mistura refs boas e inventadas', () => {
    const context = buildContext([chunk()]);
    const { text } = stripInvalidRefs('Trecho [D1:p7:c0, D5:p2:c1] final.', context);
    expect(text).toContain('[D1:p7:c0]');
    expect(text).not.toContain('D5:p2:c1');
  });

  it('extrai os refs citados inline', () => {
    expect(extractInlineRefs('ver [D1:p7:c0] e também D2:p3:c1')).toEqual([
      'D1:p7:c0',
      'D2:p3:c1',
    ]);
  });
});

describe('verificação de citação literal', () => {
  it('reconhece uma citação realmente presente no trecho', () => {
    expect(
      quoteAppearsInChunk('três cobranças que não reconhece', chunk().content),
    ).toBe(true);
  });

  it('rejeita uma citação reescrita que não está no trecho', () => {
    expect(
      quoteAppearsInChunk('o banco confessou expressamente a fraude praticada', chunk().content),
    ).toBe(false);
  });

  it('rejeita citações curtas demais para serem verificáveis', () => {
    expect(quoteAppearsInChunk('a autora', chunk().content)).toBe(false);
  });
});

describe('ajuste de confiança', () => {
  it('zera a confiança quando não sobra nenhuma fonte', () => {
    expect(adjustConfidence('HIGH', [], 0)).toBe('LOW');
  });

  it('rebaixa um nível quando parte das fontes foi descartada', () => {
    const citation = { ref: 'D1:p7:c0' } as never;
    expect(adjustConfidence('HIGH', [citation, citation], 1)).toBe('MEDIUM');
  });

  it('nunca aumenta a confiança declarada', () => {
    const citation = { ref: 'D1:p7:c0' } as never;
    expect(adjustConfidence('LOW', [citation, citation, citation], 0)).toBe('LOW');
  });
});
