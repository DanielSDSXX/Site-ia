import type { RetrievedChunk } from './retriever';

/**
 * Montagem do contexto enviado ao modelo.
 *
 * Cada trecho vira um bloco `<trecho ref="D3:p37" …>` cujo `ref` é a única
 * forma que o modelo tem de citar uma fonte. Depois da geração, o validador
 * em src/lib/intelligence/grounding.ts confere se todo `ref` citado existe
 * neste conjunto — refs inventados são descartados. É assim que a regra
 * "a IA nunca inventa uma informação documental" vira código, e não promessa.
 */

export interface ContextBlock {
  ref: string;
  chunk: RetrievedChunk;
}

export interface BuiltContext {
  /** Texto pronto para ir no prompt. */
  text: string;
  blocks: ContextBlock[];
  byRef: Map<string, RetrievedChunk>;
  chunkIds: string[];
  truncated: boolean;
}

const DEFAULT_CHAR_BUDGET = 60_000;

export function buildContext(chunks: RetrievedChunk[], charBudget = DEFAULT_CHAR_BUDGET): BuiltContext {
  const docIndex = new Map<string, number>();
  const blocks: ContextBlock[] = [];
  const byRef = new Map<string, RetrievedChunk>();
  let used = 0;
  let truncated = false;

  for (const chunk of chunks) {
    if (!docIndex.has(chunk.documentId)) docIndex.set(chunk.documentId, docIndex.size + 1);
    const ref = `D${docIndex.get(chunk.documentId)}:p${chunk.pageNumber}:c${chunk.chunkIndex}`;

    const cost = chunk.content.length + 120;
    if (used + cost > charBudget) {
      truncated = true;
      break;
    }
    used += cost;

    blocks.push({ ref, chunk });
    byRef.set(ref, chunk);
  }

  const documentLegend = [...docIndex.entries()]
    .map(([documentId, index]) => {
      const sample = chunks.find((c) => c.documentId === documentId);
      return `D${index} = "${sample?.documentTitle ?? documentId}" (${translateKind(sample?.documentKind)})`;
    })
    .join('\n');

  const body = blocks
    .map(
      (b) =>
        `<trecho ref="${b.ref}" documento="${escapeAttr(b.chunk.documentTitle)}" pagina="${b.chunk.pageNumber}">\n${b.chunk.content.trim()}\n</trecho>`,
    )
    .join('\n\n');

  const text = `DOCUMENTOS DISPONÍVEIS:\n${documentLegend || '(nenhum)'}\n\nTRECHOS RECUPERADOS:\n\n${body}`;

  return { text, blocks, byRef, chunkIds: blocks.map((b) => b.chunk.id), truncated };
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "'").replace(/[<>]/g, '');
}

export function translateKind(kind: string | undefined): string {
  const map: Record<string, string> = {
    INITIAL_PETITION: 'petição inicial',
    ANSWER: 'contestação',
    REPLY: 'réplica',
    DECISION: 'decisão',
    SENTENCE: 'sentença',
    APPEAL: 'recurso',
    EVIDENCE: 'prova documental',
    EXPERT_REPORT: 'laudo pericial',
    HEARING_MINUTES: 'ata de audiência',
    CONTRACT: 'contrato',
    POWER_OF_ATTORNEY: 'procuração',
    OTHER: 'outro',
    UNKNOWN: 'não classificado',
  };
  return map[kind ?? 'UNKNOWN'] ?? 'não classificado';
}
