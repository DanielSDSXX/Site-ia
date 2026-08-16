/**
 * Modelo interno da consulta processual (CNJ DataJud).
 *
 * Cada campo aqui corresponde a algo que a API Pública realmente publica —
 * ver o glossário oficial em https://datajud-wiki.cnj.jus.br/api-publica/.
 * O que a API não publica não ganha campo: é assim que se evita uma tela
 * que parece saber mais do que sabe.
 */

export interface DatajudMovement {
  /** Código do movimento na Tabela Processual Unificada. */
  code: number | null;
  name: string;
  occurredAt: Date | null;
  /** `complementosTabelados`, já legíveis: "variável: valor". */
  complements: string[];
  /** `movimentos.orgaoJulgador.nomeOrgao` — a vara onde o ato ocorreu. */
  judgingBody: string | null;
}

/** Situação do processo, DEDUZIDA das movimentações (a API não tem tal campo). */
export type DatajudSituationCode = 'ATIVO' | 'SUSPENSO' | 'ARQUIVADO' | 'BAIXADO' | 'INDEFINIDO';

export interface DatajudSituation {
  code: DatajudSituationCode;
  label: string;
  /**
   * A movimentação que sustenta a conclusão. Sem ela a situação é INDEFINIDO —
   * a plataforma não afirma "ativo" só porque não achou nada em contrário.
   */
  basis: { name: string; occurredAt: Date | null; code: number | null } | null;
  /** Sempre true: é leitura da linha do tempo, não um dado oficial de status. */
  inferred: true;
}

/** Sigilo processual, lido de `nivelSigilo`. */
export interface DatajudSecrecy {
  level: number;
  /** Nível 0 é público; qualquer valor acima corre em segredo de justiça. */
  isSecret: boolean;
  label: string;
}

export interface DatajudProcess {
  id: string;
  /** Número CNJ com máscara, quando os 20 dígitos vieram completos. */
  caseNumber: string;
  caseNumberDigits: string | null;
  court: string;
  index: string;
  degree: string | null;
  procedureClass: string | null;
  subjects: string[];
  judgingBody: string | null;
  filedAt: Date | null;
  lastUpdateAt: Date | null;
  system: string | null;
  /** `formato.nome` — "Eletrônico" ou "Físico". */
  format: string | null;
  secrecy: DatajudSecrecy;
  situation: DatajudSituation;
  movements: DatajudMovement[];
  sourceName: string;
}

/** Hit cru do Elasticsearch. */
export interface DatajudRecord {
  _id?: string;
  _index?: string;
  _source?: Record<string, unknown>;
}

export interface DatajudSearchResult {
  processes: DatajudProcess[];
  total: number;
  index: string;
  /** Preenchido quando a consulta falhou; a interface mostra este texto. */
  error: string | null;
}
