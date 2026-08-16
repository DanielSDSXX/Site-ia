import { env } from '@/lib/env';
import { logError } from '@/lib/errors';
import { resolveDatajudIndex } from './indexes';
import { normalizeDatajudProcess } from './normalize';
import { buildDatajudSearchBody } from './query';
import type { DatajudRecord, DatajudSearchResult } from './types';

/**
 * Cliente HTTP da API Pública do DataJud (CNJ).
 *
 * Protocolo: Elasticsearch `_search` via POST, autenticado por
 * `Authorization: APIKey <chave>`. O índice vai na URL, um por tribunal.
 */

export const DATAJUD_DEFAULT_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

export function datajudEnabled(): boolean {
  const config = env();
  return Boolean(config.DATAJUD_ENABLED && config.DATAJUD_API_KEY);
}

/** Estado da integração, exibido nas Configurações e na tela de consulta. */
export function datajudStatus(): { enabled: boolean; reason: string | null; index: string } {
  const config = env();
  if (!config.DATAJUD_ENABLED) {
    return { enabled: false, reason: 'DATAJUD_ENABLED=false', index: config.DATAJUD_TRIBUNAL_INDEX };
  }
  if (!config.DATAJUD_API_KEY) {
    return {
      enabled: false,
      reason: 'DATAJUD_API_KEY não configurada',
      index: config.DATAJUD_TRIBUNAL_INDEX,
    };
  }
  return { enabled: true, reason: null, index: config.DATAJUD_TRIBUNAL_INDEX };
}

/**
 * Consulta processos no DataJud.
 *
 * Erros de rede ou do Elasticsearch não derrubam a tela: voltam em `error`
 * para que a interface diga o que aconteceu em vez de mostrar "0 resultados",
 * que é o pior dos mundos — o usuário não sabe se não há processo ou se a
 * integração quebrou.
 */
export async function searchDatajudProcesses(
  query: string,
  options: { limit?: number; court?: string } = {},
): Promise<DatajudSearchResult> {
  const config = env();
  const index = resolveDatajudIndex(options.court);

  if (!datajudEnabled()) {
    const status = datajudStatus();
    return {
      processes: [],
      total: 0,
      index,
      error: `Integração DataJud desativada (${status.reason}).`,
    };
  }

  const base = (config.DATAJUD_BASE_URL || DATAJUD_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${base}/${index}/_search`;
  const body = buildDatajudSearchBody(query, options.limit ?? 10);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `APIKey ${config.DATAJUD_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logError('datajud.search', new Error(`HTTP ${response.status}`), {
        index,
        detail: detail.slice(0, 500),
      });
      return {
        processes: [],
        total: 0,
        index,
        error: describeHttpError(response.status, index, detail),
      };
    }

    const payload = (await response.json()) as {
      hits?: { hits?: DatajudRecord[]; total?: { value?: number } | number };
    };

    const hits = payload?.hits?.hits ?? [];
    const rawTotal = payload?.hits?.total;
    const total = typeof rawTotal === 'number' ? rawTotal : (rawTotal?.value ?? hits.length);

    return {
      processes: hits.map((hit) => normalizeDatajudProcess(hit, index)),
      total,
      index,
      error: null,
    };
  } catch (err) {
    logError('datajud.search', err, { index });
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      processes: [],
      total: 0,
      index,
      error: aborted
        ? 'A consulta ao DataJud excedeu 20 segundos. Tente novamente.'
        : 'Não foi possível falar com a API do DataJud. Verifique a conexão e a chave configurada.',
    };
  }
}

function describeHttpError(status: number, index: string, detail: string): string {
  if (status === 401 || status === 403) {
    return `O DataJud recusou a chave de API (HTTP ${status}). Confira DATAJUD_API_KEY.`;
  }
  if (status === 404) {
    return `O índice "${index}" não existe no DataJud. Escolha outro tribunal.`;
  }
  if (status === 400) {
    const parsing = detail.includes('parsing_exception') || detail.includes('unknown key');
    return parsing
      ? 'O DataJud rejeitou o formato da consulta (400).'
      : 'Consulta inválida para o DataJud (400).';
  }
  if (status === 429) return 'Limite de requisições do DataJud atingido. Aguarde e tente de novo.';
  return `O DataJud respondeu HTTP ${status}.`;
}
