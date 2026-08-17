import { z } from 'zod';
import { handle, ok, parseJson, rateLimitIdentity } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { bulkImportJurisprudence } from '@/server/jurisprudence-bulk';
import { audit } from '@/lib/audit';

/**
 * Importação de ementas em lote (planilha colada ou arquivo CSV/TSV).
 *
 * `dryRun: true` devolve a prévia sem gravar nada — é o que a tela usa para
 * mostrar quantas linhas entram, quais são recusadas e por quê, antes de o
 * usuário confirmar.
 */

const schema = z.object({
  // 5 MB de texto cobre planilhas grandes sem virar vetor de abuso.
  text: z.string().min(1, 'Cole a planilha ou envie o arquivo.').max(5_000_000),
  dryRun: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  return handle(request, 'jurisprudence.bulk', async () => {
    const ctx = await requirePermission('jurisprudence:write');
    const input = await parseJson(request, schema);

    await enforceRateLimit(RATE_LIMITS.search, await rateLimitIdentity(ctx.user.id));

    const report = await bulkImportJurisprudence(ctx.organization.id, input.text, {
      dryRun: input.dryRun,
    });

    // A prévia não altera nada, então não gera registro de auditoria.
    if (!input.dryRun && report.imported > 0) {
      await audit({
        action: 'jurisprudence.import',
        userId: ctx.user.id,
        organizationId: ctx.organization.id,
        resourceType: 'jurisprudence',
        metadata: {
          imported: report.imported,
          duplicates: report.duplicates,
          rejected: report.errors.length,
          source: 'bulk',
        },
      });
    }

    return ok(report);
  });
}
