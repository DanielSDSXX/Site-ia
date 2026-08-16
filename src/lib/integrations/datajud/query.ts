/**
 * Corpo da consulta Elasticsearch enviada ao DataJud.
 *
 * Os campos seguem o glossário oficial da API Pública
 * (https://datajud-wiki.cnj.jus.br/api-publica/glossario). Quatro detalhes
 * quebravam a integração antes:
 *
 *  1. `index` NÃO pode ir no corpo. O índice vai na URL; o Elasticsearch
 *     rejeita a requisição com `parsing_exception` se ele aparecer aqui.
 *  2. Os campos precisam ser os que o DataJud realmente indexa. Buscar em
 *     `ementa`, `texto` ou `relator` não retorna nada porque esses campos não
 *     existem neste índice — o que existe é classe, assuntos, órgão julgador
 *     e movimentos.
 *  3. `tribunal` é mapeado como text/keyword. Um `term` com a sigla em
 *     maiúsculas não casa com a forma analisada; `match` funciona nos dois.
 *  4. `@timestamp` não consta do glossário. Ordenar por um campo ausente do
 *     mapeamento devolve `query_shard_exception`, então vai com
 *     `unmapped_type` — e, em busca textual, atrás do `_score`, senão a
 *     ordenação cronológica descarta a relevância e devolve os mais antigos
 *     em vez dos mais pertinentes.
 */

/** Extrai os 20 dígitos do número CNJ, aceitando entrada com máscara. */
export function toCnjDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits.length === 20 ? digits : null;
}

export function buildDatajudSearchBody(query: string, size = 10): Record<string, unknown> {
  const trimmed = query.trim();
  const cnj = toCnjDigits(trimmed);

  // `unmapped_type` mantém a paginação estável sem quebrar índices que não
  // expõem @timestamp.
  const chronological = { '@timestamp': { order: 'asc', unmapped_type: 'date' } };

  const body: Record<string, unknown> = {
    size: Math.min(Math.max(size, 1), 100),
    _source: true,
  };

  if (cnj) {
    // Busca exata pelo número: `numeroProcesso` é text/keyword, e `match`
    // resolve nos dois mapeamentos.
    body.query = { match: { numeroProcesso: cnj } };
    body.sort = [chronological];
    return body;
  }

  body.query = {
    bool: {
      should: [
        { match: { 'classe.nome': { query: trimmed, fuzziness: 'AUTO' } } },
        { match: { 'assuntos.nome': { query: trimmed, fuzziness: 'AUTO' } } },
        { match: { 'orgaoJulgador.nome': { query: trimmed, fuzziness: 'AUTO' } } },
        { match: { 'movimentos.nome': { query: trimmed, fuzziness: 'AUTO' } } },
        { match: { tribunal: trimmed } },
      ],
      minimum_should_match: 1,
    },
  };
  body.sort = [{ _score: { order: 'desc' } }, chronological];

  return body;
}
