/**
 * Tabela de custo estimado por milhão de tokens (USD).
 *
 * Estes valores servem para o painel interno de custo de IA. Eles são uma
 * ESTIMATIVA local e não substituem a fatura do provedor — preços mudam e
 * modelos novos caem no fallback. Atualize conforme a tabela oficial de cada
 * fornecedor.
 */

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICES: Record<string, ModelPrice> = {
  // Anthropic
  'claude-opus-4-1': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
  // OpenAI
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'text-embedding-3-small': { inputPerMillion: 0.02, outputPerMillion: 0 },
  'text-embedding-3-large': { inputPerMillion: 0.13, outputPerMillion: 0 },
  // Google
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10 },
  'text-embedding-004': { inputPerMillion: 0.02, outputPerMillion: 0 },
  // Provedor local: sem custo externo.
  'local-extractive-v1': { inputPerMillion: 0, outputPerMillion: 0 },
  'local-hashing-v1': { inputPerMillion: 0, outputPerMillion: 0 },
};

const FALLBACK: ModelPrice = { inputPerMillion: 3, outputPerMillion: 15 };

export function priceFor(model: string): ModelPrice {
  if (PRICES[model]) return PRICES[model];
  // Casamento por prefixo: "claude-sonnet-4-5-20250929" -> "claude-sonnet-4-5".
  const match = Object.keys(PRICES).find((key) => model.startsWith(key));
  return match ? PRICES[match] : FALLBACK;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model);
  return (
    (inputTokens / 1_000_000) * price.inputPerMillion +
    (outputTokens / 1_000_000) * price.outputPerMillion
  );
}

/**
 * Créditos consumidos por operação. O crédito é a unidade de cobrança visível
 * ao cliente; o custo em dólar é a métrica interna.
 */
export const CREDIT_COST: Record<string, number> = {
  EMBEDDING: 0,
  CHAT: 1,
  SUMMARY: 3,
  VULNERABILITIES: 5,
  ADVERSARIAL: 5,
  TRIAL_SIMULATION: 5,
  CONTRADICTIONS: 4,
  NEXT_ACTIONS: 3,
  EVIDENCE_MAP: 4,
  CLIENT_EXPLANATION: 2,
  STRUCTURE_EXTRACTION: 3,
  OCR: 2,
  JURISPRUDENCE_SEARCH: 1,
  REPORT: 2,
};

export function creditsFor(operation: string): number {
  return CREDIT_COST[operation] ?? 1;
}
