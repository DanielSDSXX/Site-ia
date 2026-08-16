export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Quando true, instrui o provedor a responder somente com JSON. */
  json?: boolean;
  model?: string;
}

export interface CompletionResponse {
  text: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AIProvider {
  readonly name: string;
  /**
   * true quando o provedor não é um modelo de linguagem real.
   * A interface é obrigada a rotular toda saída como "modo demonstração".
   */
  readonly isDemo: boolean;
  readonly defaultModel: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  provider: string;
  inputTokens: number;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  readonly isDemo: boolean;
  embed(texts: string[]): Promise<EmbeddingResult>;
}

/** Dimensão canônica dos vetores armazenados (coluna vector(1536)). */
export const VECTOR_DIMENSIONS = 1536;

/**
 * Ajusta um vetor de qualquer dimensão para a dimensão canônica:
 * trunca o excesso ou completa com zeros, e renormaliza (L2).
 * Isso permite trocar de modelo de embedding sem migrar o schema — mas
 * vetores de modelos diferentes não são comparáveis entre si, então uma
 * troca de modelo exige reindexar (ver docs/architecture.md).
 */
export function normalizeVector(vector: number[], dimensions = VECTOR_DIMENSIONS): number[] {
  const out = new Array<number>(dimensions).fill(0);
  const limit = Math.min(vector.length, dimensions);
  for (let i = 0; i < limit; i++) out[i] = vector[i];
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) out[i] /= norm;
  }
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Estimativa de tokens usada quando o provedor não retorna contagem. */
export function estimateTokens(text: string): number {
  // ~4 caracteres por token é uma aproximação razoável para português.
  return Math.ceil(text.length / 4);
}
