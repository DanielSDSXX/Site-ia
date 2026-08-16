import type { BuiltContext } from '@/lib/rag/context';
import type { RetrievedChunk } from '@/lib/rag/retriever';
import { normalizeText } from '@/lib/text/nlp';

/**
 * Validação de ancoragem (grounding).
 *
 * Esta é a implementação concreta do sistema anti-alucinação. O modelo pode
 * citar qualquer coisa; aqui conferimos, ref por ref, se a fonte existe de
 * fato no contexto que enviamos. Refs inventados são removidos e contados.
 *
 * Consequência prática: uma afirmação que perdeu todos os refs deixa de ser
 * exibida como documentada — ela cai de confiança ou é descartada, conforme
 * a política do chamador.
 */

export interface ResolvedCitation {
  ref: string;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageId: string | null;
  pageNumber: number;
  quote: string;
  relevance: number;
}

export interface GroundingReport {
  valid: ResolvedCitation[];
  dropped: string[];
}

const REF_PATTERN = /D\d+:p\d+:c\d+/g;

/** Resolve uma lista de refs contra o contexto enviado ao modelo. */
export function resolveRefs(refs: string[], context: BuiltContext): GroundingReport {
  const valid: ResolvedCitation[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const raw of refs) {
    const ref = raw.trim().replace(/^\[|\]$/g, '');
    if (seen.has(ref)) continue;
    seen.add(ref);

    const chunk = context.byRef.get(ref);
    if (!chunk) {
      dropped.push(ref);
      continue;
    }
    valid.push(toCitation(ref, chunk, chunk.content));
  }

  return { valid, dropped };
}

function toCitation(ref: string, chunk: RetrievedChunk, quote: string): ResolvedCitation {
  return {
    ref,
    chunkId: chunk.id,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    pageId: chunk.pageId,
    pageNumber: chunk.pageNumber,
    quote: quote.slice(0, 1500),
    relevance: chunk.score,
  };
}

/**
 * Extrai refs citados no corpo de um texto livre (formato `[D1:p2:c3]`),
 * usado pelo chat, onde a resposta não é JSON.
 */
export function extractInlineRefs(text: string): string[] {
  return [...new Set(text.match(REF_PATTERN) ?? [])];
}

/**
 * Remove do texto as citações cujo ref não existe no contexto.
 * Evita que a interface renderize um link "ver evidência" que leva a lugar
 * nenhum — pior que não citar é citar errado.
 */
export function stripInvalidRefs(text: string, context: BuiltContext): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const cleaned = text.replace(/\[((?:D\d+:p\d+:c\d+)(?:\s*,\s*D\d+:p\d+:c\d+)*)\]/g, (match, group: string) => {
    const refs = group.split(',').map((r) => r.trim());
    const kept = refs.filter((ref) => {
      if (context.byRef.has(ref)) return true;
      dropped.push(ref);
      return false;
    });
    return kept.length > 0 ? `[${kept.join(', ')}]` : '';
  });

  // Refs soltos fora de colchetes.
  const finalText = cleaned.replace(REF_PATTERN, (ref) => {
    if (context.byRef.has(ref)) return ref;
    dropped.push(ref);
    return '';
  });

  return { text: finalText.replace(/\s{2,}/g, ' ').trim(), dropped };
}

/**
 * Confere se uma citação literal declarada pelo modelo realmente aparece no
 * trecho de origem. Usada nas contradições, onde a citação literal é o
 * elemento probatório mostrado ao usuário.
 *
 * A comparação é normalizada (sem acentos/pontuação) e por subsequência de
 * palavras, tolerando pequenas diferenças de espaçamento sem aceitar uma
 * frase reescrita.
 */
export function quoteAppearsInChunk(quote: string, chunkContent: string): boolean {
  const needle = normalizeText(quote).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const haystack = normalizeText(chunkContent).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (needle.length < 12) return false;
  if (haystack.includes(needle)) return true;

  // Tolerância: 90% das palavras da citação presentes em sequência aproximada.
  const words = needle.split(' ');
  if (words.length < 4) return false;
  const window = words.slice(0, Math.max(4, Math.floor(words.length * 0.6))).join(' ');
  return haystack.includes(window);
}

/**
 * Ajusta a confiança declarada para baixo quando a ancoragem é fraca.
 * Nunca ajusta para cima: se o motor disse "baixa", permanece baixa.
 */
export function adjustConfidence(
  declared: 'LOW' | 'MEDIUM' | 'HIGH',
  citations: ResolvedCitation[],
  droppedCount: number,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  const order = ['LOW', 'MEDIUM', 'HIGH'] as const;
  let index = order.indexOf(declared);

  if (citations.length === 0) index = 0;
  else if (droppedCount > citations.length) index = Math.min(index, 0);
  else if (droppedCount > 0) index = Math.max(0, index - 1);

  return order[index];
}

export const CONFIDENCE_LABELS = {
  LOW: 'Confiança baixa',
  MEDIUM: 'Confiança média',
  HIGH: 'Confiança alta',
} as const;
