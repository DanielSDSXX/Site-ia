/**
 * Utilidades de processamento de texto em português.
 *
 * Tudo aqui é determinístico e testável: tokenização, segmentação de frases,
 * ranqueamento lexical (BM25) e extração de entidades simples (datas, valores,
 * números de processo). É a base tanto da recuperação lexical do RAG quanto
 * dos motores heurísticos usados quando não há LLM conectado.
 */

export const STOPWORDS_PT = new Set([
  'a','ao','aos','aquela','aquelas','aquele','aqueles','aquilo','as','até','com','como','da','das',
  'de','dela','delas','dele','deles','depois','do','dos','e','ela','elas','ele','eles','em','entre',
  'era','eram','essa','essas','esse','esses','esta','estas','este','estes','eu','foi','foram','há',
  'isso','isto','já','lhe','lhes','mais','mas','me','mesmo','meu','meus','minha','minhas','muito',
  'na','não','nas','nem','no','nos','nossa','nossas','nosso','nossos','num','numa','o','os','ou',
  'para','pela','pelas','pelo','pelos','por','qual','quando','que','quem','se','seja','sem','ser',
  'seu','seus','só','sua','suas','também','te','tem','têm','ter','teu','teus','tu','tua','tuas','um',
  'uma','umas','uns','você','vocês','à','às','é','ainda','sobre','após','ante','sob','the','of','and',
]);

/** Normaliza: minúsculas, sem acentos, sem pontuação. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function tokenize(text: string, opts: { keepStopwords?: boolean } = {}): string[] {
  const tokens = normalizeText(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (opts.keepStopwords) return tokens;
  return tokens.filter((t) => !STOPWORDS_PT.has(t));
}

/**
 * Segmenta um texto em frases. Trata abreviações jurídicas comuns
 * ("art.", "fls.", "n.", "Sr.") para não quebrar no meio.
 */
export function splitSentences(text: string): string[] {
  const protectedText = text
    .replace(/\b(art|arts|inc|par|§|fls|fl|n|no|nº|sr|sra|dr|dra|proc|cf|ss|al|p|pág)\.\s/gi, (m) =>
      m.replace('.', '\u0001'),
    )
    .replace(/(\d)\.(\d)/g, '$1\u0001$2');

  return protectedText
    .split(/(?<=[.!?;])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ"“(])|\n{2,}/)
    .map((s) => s.replace(/\u0001/g, '.').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 20);
}

// ---------------------------------------------------------------------------
// Ranqueamento lexical (BM25)
// ---------------------------------------------------------------------------

export interface RankedItem {
  index: number;
  score: number;
}

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Ordena documentos por relevância BM25 em relação a um conjunto de termos.
 * Retorna todos os itens ordenados por score decrescente.
 */
export function rankDocuments(documents: string[], queryTokens: string[]): RankedItem[] {
  if (documents.length === 0 || queryTokens.length === 0) return [];

  const tokenized = documents.map((d) => tokenize(d));
  const lengths = tokenized.map((t) => t.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1) || 1;

  const df = new Map<string, number>();
  for (const term of new Set(queryTokens)) {
    let count = 0;
    for (const tokens of tokenized) if (tokens.includes(term)) count++;
    df.set(term, count);
  }

  const n = documents.length;
  const scores = tokenized.map((tokens, index) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const term of new Set(queryTokens)) {
      const freq = tf.get(term) ?? 0;
      if (freq === 0) continue;
      const docFreq = df.get(term) ?? 0;
      const idf = Math.log(1 + (n - docFreq + 0.5) / (docFreq + 0.5));
      const denom = freq + BM25_K1 * (1 - BM25_B + (BM25_B * lengths[index]) / avgLength);
      score += idf * ((freq * (BM25_K1 + 1)) / denom);
    }
    return { index, score };
  });

  return scores.sort((a, b) => b.score - a.score);
}

/** Igual a `rankDocuments`, mas com um pequeno bônus para frases mais curtas. */
export function rankSentences(sentences: string[], queryTokens: string[]): RankedItem[] {
  return rankDocuments(sentences, queryTokens).map((item) => ({
    ...item,
    score: item.score * (sentences[item.index].length > 600 ? 0.7 : 1),
  }));
}

/**
 * Sumarização extrativa por centralidade lexical: escolhe as frases mais
 * representativas do conjunto (aproximação de TextRank por similaridade média).
 */
export function extractiveSummary(text: string, maxSentences = 5): string[] {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return sentences;

  const tokenSets = sentences.map((s) => new Set(tokenize(s)));
  const scores = sentences.map((_, i) => {
    let sum = 0;
    for (let j = 0; j < sentences.length; j++) {
      if (i === j) continue;
      sum += jaccard(tokenSets[i], tokenSets[j]);
    }
    return { index: i, score: sum / (sentences.length - 1) };
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((s) => sentences[s.index]);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

// ---------------------------------------------------------------------------
// Extração de entidades
// ---------------------------------------------------------------------------

const MONTHS_PT: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

export interface ExtractedDate {
  date: Date;
  raw: string;
  offset: number;
}

/** Extrai datas em formatos dd/mm/aaaa, dd.mm.aaaa e "12 de março de 2026". */
export function extractDates(text: string): ExtractedDate[] {
  const out: ExtractedDate[] = [];

  for (const m of text.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/g)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    out.push({ date: new Date(Date.UTC(year, month - 1, day)), raw: m[0], offset: m.index ?? 0 });
  }

  const normalized = normalizeText(text);
  for (const m of normalized.matchAll(/\b(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/g)) {
    const month = MONTHS_PT[m[2]];
    if (month === undefined) continue;
    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    out.push({
      date: new Date(Date.UTC(Number(m[3]), month, day)),
      raw: text.slice(m.index ?? 0, (m.index ?? 0) + m[0].length),
      offset: m.index ?? 0,
    });
  }

  return out.sort((a, b) => a.offset - b.offset);
}

export interface ExtractedMoney {
  cents: number;
  raw: string;
  offset: number;
}

/**
 * Extrai valores monetários em formato brasileiro (R$ 1.234,56).
 *
 * O separador aceita qualquer espaço em branco, inclusive quebra de linha:
 * em PDFs de peças processuais é comum o valor ser quebrado entre "R$" e o
 * número, e ignorar esses casos deixaria valores relevantes fora da análise.
 */
export function extractMoney(text: string): ExtractedMoney[] {
  const out: ExtractedMoney[] = [];
  for (const m of text.matchAll(/R\$\s{0,4}([\d.]+,\d{2}|\d{1,3}(?:\.\d{3})*|\d+)/g)) {
    const numeric = m[1].replace(/\./g, '').replace(',', '.');
    const value = Number(numeric);
    if (!Number.isFinite(value)) continue;
    out.push({ cents: Math.round(value * 100), raw: m[0], offset: m.index ?? 0 });
  }
  return out;
}

/** Extrai números de processo no padrão CNJ. */
export function extractProcessNumbers(text: string): string[] {
  const matches = text.matchAll(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g);
  return [...new Set([...matches].map((m) => m[0]))];
}

/** Extrai referências legais explícitas ("art. 373, I, do CPC"). */
export function extractLegalReferences(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(
    /\b(?:art(?:igo)?s?\.?\s*\d+[\w\-º°]*(?:\s*,\s*[IVXLCDM]+)?(?:\s*,?\s*(?:§|par[áa]grafo)\s*[\w\dº°]+)?(?:\s*,?\s*d[aeo]s?\s+[A-ZÁÉÍÓÚÇ][\w./]*)?)/gi,
  )) {
    const value = m[0].replace(/\s+/g, ' ').trim();
    if (value.length > 4) out.add(value);
  }
  for (const m of text.matchAll(/\b(?:S[úu]mula\s+(?:Vinculante\s+)?n?[º°.]?\s*\d+(?:\s+do\s+[A-Z]{2,4})?)/gi)) {
    out.add(m[0].replace(/\s+/g, ' ').trim());
  }
  return [...out];
}

/** Conta ocorrências de qualquer termo de uma lista (busca normalizada). */
export function countTerms(text: string, terms: string[]): number {
  const normalized = normalizeText(text);
  let total = 0;
  for (const term of terms) {
    const needle = normalizeText(term);
    let index = normalized.indexOf(needle);
    while (index !== -1) {
      total++;
      index = normalized.indexOf(needle, index + needle.length);
    }
  }
  return total;
}

export function containsAny(text: string, terms: string[]): boolean {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

/** Recorta uma janela de contexto ao redor da primeira ocorrência de um termo. */
export function contextWindow(text: string, term: string, radius = 220): string | null {
  const normalized = normalizeText(text);
  const index = normalized.indexOf(normalizeText(term));
  if (index === -1) return null;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + term.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${
    end < text.length ? '…' : ''
  }`;
}
