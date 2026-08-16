import { indexToCourt } from './indexes';
import { toCnjDigits } from './query';
import { deriveSituation, readSecrecy } from './situation';
import type { DatajudMovement, DatajudProcess, DatajudRecord } from './types';

/**
 * Converte um hit do DataJud no modelo interno.
 *
 * O mapeamento é tolerante com variações de nome de campo, mas nunca inventa:
 * o que não vier na resposta fica `null` ou lista vazia. É o mesmo princípio
 * do resto da plataforma — preferimos um traço na tela a um dado plausível.
 */
export function normalizeDatajudProcess(item: DatajudRecord, fallbackIndex = ''): DatajudProcess {
  const source = (item?._source ?? {}) as Record<string, unknown>;

  const rawNumber = readString(source, ['numeroProcesso', 'numero', 'numeroProcessoCNJ']) ?? '';
  const digits = toCnjDigits(rawNumber);

  const court =
    readString(source, ['tribunal', 'tribunalNome', 'nomeTribunal']) ??
    indexToCourt(item._index ?? fallbackIndex);

  const movements = readArray(source, ['movimentos', 'movimentacoes'])
    .map((entry) => normalizeMovement(entry))
    .filter((entry): entry is DatajudMovement => entry !== null)
    .sort((a, b) => (a.occurredAt?.getTime() ?? 0) - (b.occurredAt?.getTime() ?? 0));

  return {
    // `_source.id` é a chave composta do CNJ
    // (Tribunal_Classe_Grau_OrgaoJulgador_NumeroProcesso).
    id: item._id ?? readString(source, ['id']) ?? digits ?? rawNumber ?? crypto.randomUUID(),
    caseNumber: digits ? maskCnj(digits) : rawNumber || 'Não informado',
    caseNumberDigits: digits,
    court,
    index: item._index ?? fallbackIndex,
    degree: readString(source, ['grau']),
    procedureClass:
      readNested(source, 'classe', 'nome') ?? readString(source, ['classeNome', 'classe']),
    subjects: readArray(source, ['assuntos', 'assunto'])
      .map((entry) =>
        typeof entry === 'string' ? entry : (readNested({ e: entry }, 'e', 'nome') ?? null),
      )
      .filter((value): value is string => Boolean(value)),
    judgingBody:
      readNested(source, 'orgaoJulgador', 'nome') ?? readString(source, ['orgaoJulgadorNome']),
    filedAt: toDate(readString(source, ['dataAjuizamento'])),
    lastUpdateAt: toDate(
      readString(source, ['dataHoraUltimaAtualizacao', '@timestamp', 'dataUltimaAtualizacao']),
    ),
    system: readNested(source, 'sistema', 'nome'),
    format: readNested(source, 'formato', 'nome'),
    secrecy: readSecrecy(readNumber(source, ['nivelSigilo'])),
    situation: deriveSituation(movements),
    movements,
    sourceName: `CNJ DataJud · ${item._index ?? fallbackIndex}`,
  };
}

function normalizeMovement(entry: unknown): DatajudMovement | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;

  const name = readString(row, ['nome', 'descricao', 'movimento']);
  if (!name) return null;

  /*
    Glossário do CNJ para complementosTabelados:
      descricao → nome da variável   ("tipo_de_decisao")
      nome      → texto do valor     ("Com resolução do mérito")
      valor     → CÓDIGO numérico do complemento
      codigo    → código da variável

    O par legível é `descricao: nome`. Usar `valor` imprimiria um número solto
    na tela, sem significado para quem lê.
  */
  const complements = readArray(row, ['complementosTabelados'])
    .map((complement) => {
      if (typeof complement === 'string') return complement;
      if (!complement || typeof complement !== 'object') return null;
      const c = complement as Record<string, unknown>;
      const variable = readString(c, ['descricao']);
      const label = readString(c, ['nome']) ?? readString(c, ['valor']);
      if (!variable && !label) return null;
      return [variable, label].filter(Boolean).join(': ');
    })
    .filter((value): value is string => Boolean(value));

  const movementBody = row.orgaoJulgador;
  const judgingBody =
    movementBody && typeof movementBody === 'object' && !Array.isArray(movementBody)
      ? readString(movementBody as Record<string, unknown>, ['nomeOrgao', 'nome'])
      : null;

  return {
    code: readNumber(row, ['codigo']),
    name,
    occurredAt: toDate(readString(row, ['dataHora', 'data', 'dataHoraMovimento'])),
    complements,
    judgingBody,
  };
}

/** Aplica a máscara CNJ a 20 dígitos. */
export function maskCnj(digits: string): string {
  if (digits.length !== 20) return digits;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(
    13,
    14,
  )}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

// ---------------------------------------------------------------------------
// Leitores tolerantes
// ---------------------------------------------------------------------------

function readString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function readNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function readNested(source: Record<string, unknown>, key: string, child: string): string | null {
  const value = source[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const nested = (value as Record<string, unknown>)[child];
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function readArray(source: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return [value];
  }
  return [];
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
