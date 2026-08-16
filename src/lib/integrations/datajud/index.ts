/**
 * Integração com a API Pública do DataJud (CNJ).
 *
 * O QUE ESTA API É — e o que ela NÃO é:
 *
 * É fonte OFICIAL de **dados processuais**: número CNJ, tribunal, grau,
 * classe, assuntos, órgão julgador, formato, nível de sigilo, data de
 * ajuizamento e a lista de MOVIMENTAÇÕES do processo.
 *
 * Ela NÃO publica ementa, inteiro teor, relator, tese firmada — nem o **nome
 * das partes**, nem um campo de **situação** do processo. Por isso:
 *
 *  - a situação (ativo/suspenso/arquivado) é DEDUZIDA das movimentações e sai
 *    sempre marcada como inferência, com o andamento que a sustenta
 *    (ver `situation.ts`);
 *  - as partes vêm do cadastro do próprio escritório, quando o número bate, e
 *    a tela diz de onde vieram (ver `src/server/datajud.ts`);
 *  - nada disto alimenta o acervo de jurisprudência, que exige ementa e link
 *    verificável.
 *
 * Documentação: https://datajud-wiki.cnj.jus.br/api-publica/
 */

export { DATAJUD_DEFAULT_BASE_URL, datajudEnabled, datajudStatus, searchDatajudProcesses } from './client';
export { DATAJUD_INDEXES, indexFromCaseNumber, indexToCourt, resolveDatajudIndex } from './indexes';
export { maskCnj, normalizeDatajudProcess } from './normalize';
export { buildDatajudSearchBody, toCnjDigits } from './query';
export { deriveSituation, readSecrecy } from './situation';
export type {
  DatajudMovement,
  DatajudProcess,
  DatajudRecord,
  DatajudSearchResult,
  DatajudSecrecy,
  DatajudSituation,
  DatajudSituationCode,
} from './types';
