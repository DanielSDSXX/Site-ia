/**
 * Leitura de ementas em lote, coladas de uma planilha ou de um arquivo CSV.
 *
 * Por que um parser próprio em vez de `split(',')`: ementa é texto jurídico,
 * cheia de vírgula, aspas e quebra de linha. Um split ingênuo picotaria a
 * ementa no meio e gravaria pedaços como se fossem colunas — o tipo de erro
 * que só aparece semanas depois, quando alguém cita metade de um acórdão.
 *
 * Aceita CSV (vírgula) e TSV (tabulação, que é o que sai ao copiar do Excel ou
 * do Google Sheets), com aspas duplas no padrão RFC 4180: `""` dentro de um
 * campo entre aspas é uma aspa literal.
 */

export interface ParsedRow {
  /** Número da linha no arquivo, contando o cabeçalho. Serve para o relatório. */
  line: number;
  values: Record<string, string>;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Cabeçalhos reconhecidos, já normalizados para os nomes internos. */
  headers: string[];
  /** Cabeçalhos presentes no arquivo que a plataforma não conhece. */
  unknownHeaders: string[];
  delimiter: ',' | ';' | '\t';
}

/**
 * Sinônimos aceitos para cada coluna.
 *
 * A planilha vem do escritório, não da plataforma: aceitar "ementa", "resumo"
 * ou "summary" para a mesma coisa evita obrigar o usuário a renomear colunas
 * antes de importar.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  court: ['tribunal', 'court', 'orgao', 'órgão'],
  judgingBody: ['orgao julgador', 'órgão julgador', 'camara', 'câmara', 'turma', 'judgingbody'],
  caseNumber: ['numero', 'número', 'numero do processo', 'número do processo', 'processo', 'casenumber', 'numero cnj', 'número cnj'],
  judgmentDate: ['data', 'data do julgamento', 'julgado em', 'judgmentdate', 'data julgamento'],
  reporter: ['relator', 'relatora', 'reporter'],
  summary: ['ementa', 'resumo', 'summary'],
  thesis: ['tese', 'tese firmada', 'thesis'],
  outcome: ['resultado', 'outcome', 'dispositivo'],
  excerpt: ['trecho', 'excerto', 'excerpt'],
  sourceUrl: ['url', 'link', 'fonte url', 'url da fonte', 'sourceurl', 'endereco', 'endereço'],
  sourceName: ['fonte', 'nome da fonte', 'sourcename', 'origem'],
};

function normalizeHeader(raw: string): string | null {
  const key = raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const normalizedAliases = aliases.map((alias) =>
      alias
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase(),
    );
    if (normalizedAliases.includes(key)) return field;
  }
  return null;
}

/** Descobre o separador olhando a primeira linha fora de aspas. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let inQuotes = false;
  const counts = { ',': 0, ';': 0, '\t': 0 };

  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === ',' || char === ';' || char === '\t')) counts[char]++;
  }

  // Tabulação primeiro: é o que vem ao colar do Excel, e nunca aparece por
  // acaso num cabeçalho.
  if (counts['\t'] > 0) return '\t';
  return counts[';'] > counts[','] ? ';' : ',';
}

/** Divide o texto em células respeitando aspas e quebras de linha internas. */
function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // aspas escapadas
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export function parseJurisprudenceTable(text: string): ParseResult {
  const delimiter = detectDelimiter(text);
  const records = splitRecords(text.trim(), delimiter);

  if (records.length === 0) {
    return { rows: [], headers: [], unknownHeaders: [], delimiter };
  }

  const rawHeaders = records[0];
  const mapped = rawHeaders.map((h) => normalizeHeader(h));
  const headers = mapped.filter((h): h is string => h !== null);
  const unknownHeaders = rawHeaders.filter((_, i) => mapped[i] === null).map((h) => h.trim());

  const rows: ParsedRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    const values: Record<string, string> = {};

    for (let c = 0; c < mapped.length; c++) {
      const field = mapped[c];
      if (!field) continue;
      values[field] = (record[c] ?? '').trim();
    }

    rows.push({ line: i + 1, values });
  }

  return { rows, headers, unknownHeaders, delimiter };
}
