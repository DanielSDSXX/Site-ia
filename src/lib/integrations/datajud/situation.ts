import type { DatajudMovement, DatajudSecrecy, DatajudSituation } from './types';

/**
 * Situação do processo: ativo, suspenso ou arquivado.
 *
 * IMPORTANTE — de onde isto vem. A API Pública do DataJud **não publica um
 * campo de situação**. O glossário oficial traz número, classe, assuntos,
 * órgão julgador, grau, sigilo e movimentações; status não está lá.
 *
 * Então a situação é DEDUZIDA da última movimentação decisiva, e sai da
 * função marcada com `inferred: true` e acompanhada da movimentação que a
 * sustenta (`basis`). A interface é obrigada a mostrar essa base junto do
 * rótulo: o advogado precisa poder discordar da leitura olhando o mesmo
 * andamento que a plataforma olhou.
 *
 * Sem movimentação que sustente a conclusão, o resultado é INDEFINIDO. Não
 * afirmamos "ativo" apenas por não termos achado um arquivamento — ausência
 * de prova não é prova.
 */

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/*
  A ordem importa: "desarquivamento" contém "arquivamento", e "levantamento da
  suspensão" contém "suspensão". As regras que reativam o processo vêm antes
  das que o paralisam, senão um desarquivamento seria lido como arquivamento.
*/
const RULES: { match: string[]; code: DatajudSituation['code']; label: string }[] = [
  {
    match: ['desarquivamento', 'levantamento da suspensao', 'levantamento do sobrestamento'],
    code: 'ATIVO',
    label: 'Ativo — retomado',
  },
  {
    match: ['reativacao', 'retomada do curso', 'prosseguimento do feito'],
    code: 'ATIVO',
    label: 'Ativo — retomado',
  },
  {
    match: ['baixa definitiva', 'baixa dos autos'],
    code: 'BAIXADO',
    label: 'Baixado',
  },
  {
    match: ['arquivamento', 'arquivado', 'arquivamento definitivo'],
    code: 'ARQUIVADO',
    label: 'Arquivado',
  },
  {
    match: ['suspensao', 'suspenso', 'sobrestamento', 'sobrestado'],
    code: 'SUSPENSO',
    label: 'Suspenso',
  },
];

/** Lê a situação a partir das movimentações (ordenadas da mais antiga à mais recente). */
export function deriveSituation(movements: DatajudMovement[]): DatajudSituation {
  // Da mais recente para a mais antiga: o último ato decisivo é o que vale.
  for (let i = movements.length - 1; i >= 0; i--) {
    const movement = movements[i];
    const name = normalize(movement.name);

    for (const rule of RULES) {
      if (rule.match.some((term) => name.includes(term))) {
        return {
          code: rule.code,
          label: rule.label,
          basis: { name: movement.name, occurredAt: movement.occurredAt, code: movement.code },
          inferred: true,
        };
      }
    }
  }

  const last = movements[movements.length - 1];
  if (last) {
    return {
      code: 'ATIVO',
      label: 'Em curso',
      basis: { name: last.name, occurredAt: last.occurredAt, code: last.code },
      inferred: true,
    };
  }

  return {
    code: 'INDEFINIDO',
    label: 'Não foi possível determinar',
    basis: null,
    inferred: true,
  };
}

/**
 * Sigilo processual, a partir de `nivelSigilo`.
 *
 * Nível 0 é público. Acima disso o processo corre em segredo de justiça e a
 * própria API devolve os dados de forma restrita — o que a tela mostrar pode
 * estar incompleto, e isso precisa ser dito.
 */
export function readSecrecy(level: number | null): DatajudSecrecy {
  const value = typeof level === 'number' && Number.isFinite(level) ? level : 0;
  if (value <= 0) {
    return { level: 0, isSecret: false, label: 'Público' };
  }
  return {
    level: value,
    isSecret: true,
    label: `Segredo de justiça (nível ${value})`,
  };
}
