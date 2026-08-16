/**
 * Utilitários de cache e performance.
 *
 * Implementa estratégias de cache para diferentes tipos de dados:
 * - Dados de organização: 5 minutos
 * - Dados de processos: 2 minutos
 * - Dados de documentos: 1 minuto
 * - Dados de análise: 10 minutos
 */

type CacheEntry<T> = {
  value: T;
  timestamp: number;
  ttl: number; // em ms
};

const cache = new Map<string, CacheEntry<any>>();

/**
 * Obtém valor do cache se válido, senão executa função.
 *
 * @param key - Chave única do cache
 * @param ttl - Tempo de vida em milissegundos
 * @param fn - Função que retorna o valor
 */
export async function withCache<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);

  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.value as T;
  }

  const value = await fn();
  cache.set(key, { value, timestamp: Date.now(), ttl });

  return value;
}

/**
 * Cache para queries de organização (5 minutos).
 */
export async function withOrgCache<T>(
  organizationId: string,
  resource: string,
  fn: () => Promise<T>
): Promise<T> {
  return withCache(`org:${organizationId}:${resource}`, 5 * 60 * 1000, fn);
}

/**
 * Cache para queries de processos (2 minutos).
 */
export async function withProcessCache<T>(
  organizationId: string,
  processId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withCache(`proc:${organizationId}:${processId}`, 2 * 60 * 1000, fn);
}

/**
 * Cache para queries de documentos (1 minuto).
 */
export async function withDocumentCache<T>(
  documentId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withCache(`doc:${documentId}`, 1 * 60 * 1000, fn);
}

/**
 * Invalida cache de uma chave específica.
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalida todas as chaves que começam com um prefixo.
 */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Limpa o cache inteiro.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Retorna estatísticas do cache.
 */
export function getCacheStats(): { size: number; entries: number } {
  return { size: cache.size, entries: cache.size };
}

/**
 * Headers HTTP para caching de respostas.
 */
export const cacheHeaders = {
  // Dados que mudam raramente (5 minutos)
  organization: { 'Cache-Control': 'private, max-age=300' },
  // Dados que mudam frequentemente (1 minuto)
  processes: { 'Cache-Control': 'private, max-age=60' },
  // Dados em tempo real (sem cache)
  realtime: { 'Cache-Control': 'private, max-age=0, must-revalidate' },
  // Arquivo estático (1 ano)
  static: { 'Cache-Control': 'public, max-age=31536000, immutable' },
};
