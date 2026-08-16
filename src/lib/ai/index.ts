import { aiApiKey, embeddingApiKey, env } from '@/lib/env';
import type { AIProvider, EmbeddingProvider } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIEmbeddingProvider, OpenAIProvider } from './providers/openai';
import { GoogleEmbeddingProvider, GoogleProvider } from './providers/google';
import { LocalExtractiveProvider, LocalHashingEmbeddingProvider } from './providers/local';

export * from './types';
export { DEMO_NOTICE } from './providers/local';

let providerCache: AIProvider | null = null;
let embeddingCache: EmbeddingProvider | null = null;

/**
 * Resolve o provedor de geração de texto configurado.
 *
 * Se o provedor externo estiver selecionado mas sem chave de API, caímos no
 * provedor local em vez de quebrar — e o `isDemo = true` faz a interface
 * avisar o usuário. Falhar em silêncio seria pior; fingir que há IA seria
 * inaceitável.
 */
export function aiProvider(): AIProvider {
  if (providerCache) return providerCache;
  const e = env();
  const key = aiApiKey();

  if (!key || e.AI_PROVIDER === 'local') {
    providerCache = new LocalExtractiveProvider();
    return providerCache;
  }

  switch (e.AI_PROVIDER) {
    case 'anthropic':
      providerCache = new AnthropicProvider(key, e.AI_MODEL);
      break;
    case 'openai':
      providerCache = new OpenAIProvider(key, e.AI_MODEL);
      break;
    case 'google':
      providerCache = new GoogleProvider(key, e.AI_MODEL);
      break;
    default:
      providerCache = new LocalExtractiveProvider();
  }
  return providerCache;
}

export function embeddingProvider(): EmbeddingProvider {
  if (embeddingCache) return embeddingCache;
  const e = env();
  const key = embeddingApiKey();

  if (!key || e.EMBEDDING_PROVIDER === 'local') {
    embeddingCache = new LocalHashingEmbeddingProvider();
    return embeddingCache;
  }

  switch (e.EMBEDDING_PROVIDER) {
    case 'openai':
      embeddingCache = new OpenAIEmbeddingProvider(key, e.EMBEDDING_MODEL);
      break;
    case 'google':
      embeddingCache = new GoogleEmbeddingProvider(key, e.EMBEDDING_MODEL);
      break;
    default:
      embeddingCache = new LocalHashingEmbeddingProvider();
  }
  return embeddingCache;
}

/** Apenas para testes: injeta provedores alternativos. */
export function setProviders(ai: AIProvider | null, embedding: EmbeddingProvider | null) {
  providerCache = ai;
  embeddingCache = embedding;
}

export function resetProviders() {
  providerCache = null;
  embeddingCache = null;
}

/**
 * Extrai um objeto JSON da resposta de um LLM, tolerando cercas de código e
 * texto ao redor. Retorna null quando não há JSON válido — o chamador deve
 * tratar isso como falha de análise, nunca inventar um resultado.
 */
export function parseJsonResponse<T>(text: string): T | null {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  const attempt = (candidate: string): T | null => {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      return null;
    }
  };

  const direct = attempt(cleaned);
  if (direct) return direct;

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return attempt(cleaned.slice(start, end + 1));
  }
  return null;
}
