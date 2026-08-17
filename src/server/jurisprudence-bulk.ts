import { prisma } from '@/lib/db';
import { jurisprudenceImportSchema } from '@/lib/validation';
import { parseJurisprudenceTable } from '@/lib/jurisprudence/csv';
import { embedJurisprudence } from '@/server/jurisprudence';

/**
 * Importação de ementas em lote.
 *
 * Duas garantias que moldam o desenho:
 *
 *  1. **Nada entra pela metade em silêncio.** Cada linha é validada
 *     individualmente e o relatório diz, por número de linha, o que foi
 *     rejeitado e por quê. Importar 40 de 50 sem avisar quais 10 faltaram
 *     seria pior do que não importar nada.
 *  2. **A regra da fonte continua valendo.** `sourceUrl` e `sourceName` são
 *     obrigatórios linha a linha, como no cadastro individual. Importar em
 *     massa não é atalho para entrar decisão não conferível no acervo.
 *
 * O `dryRun` existe para a tela poder mostrar a prévia antes de gravar: o
 * usuário vê o que vai entrar e o que vai ser recusado, e só então confirma.
 */

export interface RowError {
  line: number;
  /** Campo problemático, quando dá para identificar. */
  field: string | null;
  message: string;
}

export interface BulkImportReport {
  /** Linhas de dados encontradas na planilha (sem o cabeçalho). */
  totalRows: number;
  /** Linhas válidas — importadas, ou que seriam importadas no dryRun. */
  valid: number;
  imported: number;
  /** Já existiam no acervo (mesmo tribunal + número). */
  duplicates: number;
  errors: RowError[];
  unknownHeaders: string[];
  missingColumns: string[];
  /** Amostra do que foi lido, para a prévia na tela. */
  preview: { line: number; court: string; caseNumber: string; summary: string }[];
}

const REQUIRED_COLUMNS = ['court', 'caseNumber', 'summary', 'sourceUrl', 'sourceName'];

export async function bulkImportJurisprudence(
  organizationId: string,
  text: string,
  options: { dryRun?: boolean } = {},
): Promise<BulkImportReport> {
  const dryRun = options.dryRun ?? false;
  const parsed = parseJurisprudenceTable(text);

  const missingColumns = REQUIRED_COLUMNS.filter((column) => !parsed.headers.includes(column));

  const report: BulkImportReport = {
    totalRows: parsed.rows.length,
    valid: 0,
    imported: 0,
    duplicates: 0,
    errors: [],
    unknownHeaders: parsed.unknownHeaders,
    missingColumns,
    preview: [],
  };

  // Sem as colunas obrigatórias não há o que validar linha a linha: o problema
  // é o cabeçalho, e é isso que precisa ser dito.
  if (missingColumns.length > 0 || parsed.rows.length === 0) return report;

  for (const row of parsed.rows) {
    const candidate = {
      court: row.values.court ?? '',
      judgingBody: row.values.judgingBody || null,
      caseNumber: row.values.caseNumber ?? '',
      judgmentDate: row.values.judgmentDate ? parseDate(row.values.judgmentDate) : null,
      reporter: row.values.reporter || null,
      summary: row.values.summary ?? '',
      thesis: row.values.thesis || null,
      outcome: row.values.outcome || null,
      excerpt: row.values.excerpt || null,
      sourceUrl: row.values.sourceUrl ?? '',
      sourceName: row.values.sourceName ?? '',
    };

    const result = jurisprudenceImportSchema.safeParse(candidate);
    if (!result.success) {
      for (const issue of result.error.issues.slice(0, 3)) {
        report.errors.push({
          line: row.line,
          field: issue.path.join('.') || null,
          message: issue.message,
        });
      }
      continue;
    }

    const input = result.data;

    const existing = await prisma.jurisprudence.findFirst({
      where: { organizationId, court: input.court, caseNumber: input.caseNumber },
      select: { id: true },
    });

    if (existing) {
      report.duplicates++;
      continue;
    }

    report.valid++;
    if (report.preview.length < 5) {
      report.preview.push({
        line: row.line,
        court: input.court,
        caseNumber: input.caseNumber,
        summary: input.summary.slice(0, 160),
      });
    }

    if (dryRun) continue;

    const created = await prisma.jurisprudence.create({
      data: {
        organizationId,
        court: input.court,
        judgingBody: input.judgingBody ?? null,
        caseNumber: input.caseNumber,
        judgmentDate: input.judgmentDate ?? null,
        reporter: input.reporter ?? null,
        summary: input.summary,
        thesis: input.thesis ?? null,
        outcome: input.outcome ?? null,
        excerpt: input.excerpt ?? null,
        sourceUrl: input.sourceUrl,
        sourceName: input.sourceName,
        verified: true,
      },
    });
    report.imported++;

    /*
      Embedding em sequência, não em paralelo: uma planilha de 300 ementas
      dispararia 300 chamadas simultâneas ao provedor. Falha aqui não desfaz a
      importação — a ementa fica gravada e pesquisável por BM25, só sem busca
      semântica até ser reindexada.
    */
    await embedJurisprudence(created.id).catch(() => undefined);
  }

  return report;
}

/** Aceita ISO (2026-03-11) e o formato brasileiro (11/03/2026). */
function parseDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;

  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
