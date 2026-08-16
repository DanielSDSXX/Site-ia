import { env } from '@/lib/env';

export const DATAJUD_DEFAULT_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

export interface DatajudRecord {
  _id?: string;
  _source?: Record<string, unknown>;
  sort?: number[];
}

export function buildDatajudSearchBody(
  query: string,
  size = 10,
  indexName = 'api_publica_tjgo',
): Record<string, unknown> {
  const trimmed = query.trim();
  const isProcessNumber = /^\d{20}$/.test(trimmed);

  return {
    size,
    _source: true,
    sort: [{ '@timestamp': { order: 'asc' } }],
    index: indexName,
    query: isProcessNumber
      ? {
          match: {
            numeroProcesso: trimmed,
          },
        }
      : {
          bool: {
            must: [
              {
                multi_match: {
                  query: trimmed,
                  fields: [
                    'ementa',
                    'texto',
                    'assunto',
                    'tribunal',
                    'orgaoJulgador.nome',
                    'orgaoJulgador.codigo',
                    'numeroProcesso',
                    'relator',
                    'classe.codigo',
                  ],
                  fuzziness: 'AUTO',
                  minimum_should_match: '60%',
                },
              },
            ],
            should: [
              { match_phrase: { ementa: trimmed } },
              { match: { assunto: trimmed } },
              { match: { tribunal: trimmed } },
            ],
            minimum_should_match: 0,
          },
        },
  };
}

export function normalizeDatajudRecord(item: DatajudRecord) {
  const source = (item?._source ?? {}) as Record<string, any>;
  const tribunal = stringFromSource(source, [
    'tribunal',
    'tribunalNome',
    'tribunalJulgador',
    'court',
    'nomeTribunal',
  ]);

  const judgingBody = stringFromSource(source, [
    'orgaoJulgador',
    'orgaoJulgador.nome',
    'orgaoJulgadorNome',
    'orgaoJulgadorDescricao',
  ]);

  const caseNumber = stringFromSource(source, [
    'numeroProcesso',
    'numero',
    'numeroProcessoCNJ',
    'processo.numero',
    'processo',
  ]);

  const decisionDate = firstAny(source, [
    'dataJulgamento',
    'data',
    'dataDecisao',
    'dataDoJulgamento',
    'dtJulgamento',
    '@timestamp',
  ]);

  const reporter = stringFromSource(source, ['relator', 'relatorNome', 'ponente']);
  const summary = stringFromSource(source, [
    'ementa',
    'texto',
    'descricao',
    'dispositivo',
    'decisao',
  ]);
  const thesis = stringFromSource(source, ['tese', 'teese', 'teseJuridica', 'fundamento']);
  const outcome = stringFromSource(source, ['resultado', 'saida', 'resultadoDecisao']);
  const sourceUrl = stringFromSource(source, ['url', 'link', 'urlProcesso', 'href', 'sourceUrl']);

  return {
    id: item?._id ?? `${tribunal}:${caseNumber ?? summary}`,
    court: tribunal || 'Datajud',
    judgingBody: judgingBody || null,
    caseNumber: caseNumber || 'Não informado',
    judgmentDate: toDate(decisionDate),
    reporter: reporter || null,
    summary: summary || 'Sem ementa disponível.',
    thesis: thesis || null,
    outcome: outcome || null,
    excerpt: summary || null,
    sourceUrl: normalizeUrl(sourceUrl),
    sourceName: tribunal || 'Datajud API',
    verified: Boolean(normalizeUrl(sourceUrl)),
    isDemo: false,
  };
}

export function resolveDatajudIndex(court?: string): string {
  const normalized = (court ?? '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    tjgo: 'api_publica_tjgo',
    tjsp: 'api_publica_tjsp',
    stj: 'api_publica_stj',
    tse: 'api_publica_tse',
    tst: 'api_publica_tst',
    stm: 'api_publica_stm',
    trf1: 'api_publica_trf1',
    trf2: 'api_publica_trf2',
    trf3: 'api_publica_trf3',
    trf4: 'api_publica_trf4',
  };

  return aliases[normalized] ?? (env().DATAJUD_TRIBUNAL_INDEX || 'api_publica_tjgo');
}

export async function searchDatajudOfficial(
  query: string,
  limit = 10,
  court?: string,
): Promise<Array<ReturnType<typeof normalizeDatajudRecord>>> {
  const config = env();
  if (!config.DATAJUD_ENABLED || !config.DATAJUD_API_KEY) return [];

  const base = (config.DATAJUD_BASE_URL || DATAJUD_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const index = resolveDatajudIndex(court);
  const url = `${base}/${index}/_search`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `APIKey ${config.DATAJUD_API_KEY}`,
    },
    body: JSON.stringify(buildDatajudSearchBody(query, limit, index)),
  });

  if (!response.ok) {
    console.warn(`Datajud falhou com ${response.status} para ${index}: ${await response.text().catch(() => '')}`);
    return [];
  }

  const payload = (await response.json()) as { hits?: { hits?: DatajudRecord[] } };
  const hits = payload?.hits?.hits ?? [];

  return hits
    .map((item) => normalizeDatajudRecord(item))
    .filter((row) => row.verified && row.sourceUrl && row.summary && row.caseNumber !== 'Não informado');
}

function firstAny(source: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = key.includes('.') ? getByPath(source, key) : source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function stringFromSource(source: Record<string, any>, keys: string[]) {
  const value = firstAny(source, keys);
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.join(', ');
  return String(value).trim();
}

function getByPath(source: Record<string, any>, path: string) {
  return path.split('.').reduce<any>((acc, part) => (acc == null ? undefined : acc[part]), source);
}

function normalizeUrl(value: string | null): string | null {
  if (!value) return null;
  const str = value.trim();
  try {
    const parsed = new URL(str);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
