import { splitSentences } from '@/lib/text/nlp';
import type { ExtractedPage } from './extract';

/**
 * Chunking com fronteira de página.
 *
 * Um chunk NUNCA cruza páginas. Isso custa alguns chunks pequenos no fim de
 * cada página, mas garante que a citação "página N" seja sempre exata — que é
 * o compromisso central do produto. A sobreposição entre chunks vizinhos
 * preserva o contexto de frases cortadas.
 */

export interface Chunk {
  pageNumber: number;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
  tokenEstimate: number;
}

export interface ChunkOptions {
  targetChars?: number;
  overlapChars?: number;
  minChars?: number;
}

const DEFAULTS = { targetChars: 1400, overlapChars: 180, minChars: 80 };

export function chunkPages(pages: ExtractedPage[], options: ChunkOptions = {}): Chunk[] {
  const { targetChars, overlapChars, minChars } = { ...DEFAULTS, ...options };
  const chunks: Chunk[] = [];
  let index = 0;

  for (const page of pages) {
    const text = page.text.trim();
    if (text.length < minChars) {
      if (text.length > 0) {
        chunks.push({
          pageNumber: page.pageNumber,
          chunkIndex: index++,
          content: text,
          charStart: 0,
          charEnd: text.length,
          tokenEstimate: Math.ceil(text.length / 4),
        });
      }
      continue;
    }

    for (const piece of splitPageText(text, targetChars, overlapChars)) {
      chunks.push({
        pageNumber: page.pageNumber,
        chunkIndex: index++,
        content: piece.text,
        charStart: piece.start,
        charEnd: piece.end,
        tokenEstimate: Math.ceil(piece.text.length / 4),
      });
    }
  }

  return chunks;
}

interface Piece {
  text: string;
  start: number;
  end: number;
}

/**
 * Quebra o texto de uma página em pedaços de ~targetChars, cortando em
 * fronteiras de frase sempre que possível.
 */
function splitPageText(text: string, targetChars: number, overlapChars: number): Piece[] {
  if (text.length <= targetChars) {
    return [{ text, start: 0, end: text.length }];
  }

  const sentences = splitSentences(text);
  // Sem frases detectáveis (tabelas, listas), corta por tamanho fixo.
  if (sentences.length <= 1) {
    const pieces: Piece[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(text.length, start + targetChars);
      pieces.push({ text: text.slice(start, end).trim(), start, end });
      if (end >= text.length) break;
      start = end - overlapChars;
    }
    return pieces.filter((p) => p.text.length > 0);
  }

  const pieces: Piece[] = [];
  let buffer = '';
  let bufferStart = 0;
  let cursor = 0;

  for (const sentence of sentences) {
    const at = text.indexOf(sentence, cursor);
    const sentenceStart = at === -1 ? cursor : at;
    cursor = sentenceStart + sentence.length;

    if (buffer && buffer.length + sentence.length > targetChars) {
      pieces.push({ text: buffer.trim(), start: bufferStart, end: sentenceStart });
      // Sobreposição: reaproveita a cauda do chunk anterior.
      const tail = buffer.slice(Math.max(0, buffer.length - overlapChars));
      buffer = tail;
      bufferStart = Math.max(0, sentenceStart - tail.length);
    }

    if (!buffer) bufferStart = sentenceStart;
    buffer += (buffer ? ' ' : '') + sentence;
  }

  if (buffer.trim()) {
    pieces.push({ text: buffer.trim(), start: bufferStart, end: text.length });
  }

  return pieces;
}
