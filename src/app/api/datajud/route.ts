import { z } from 'zod';
import { handle, ok, parseJson, parseQuery, rateLimitIdentity } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { consultDatajud, importDatajudMovements } from '@/server/datajud';
import { DATAJUD_INDEXES, datajudStatus } from '@/lib/integrations/datajud';
import { serialize } from '@/server/serialize';
import { audit } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';

/**
 * Consulta processual na API Pública do CNJ (DataJud).
 *
 * Fonte oficial de dados processuais e movimentações. Não é jurisprudência —
 * o acervo de ementas continua em /api/jurisprudence.
 */

const querySchema = z.object({
  q: z.string().trim().min(1, 'Informe o número do processo ou um termo.').max(200),
  court: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export async function GET(request: Request) {
  return handle(request, 'datajud.consult', async () => {
    // Dado processual, não jurisprudência: quem lê processo pode consultar.
    const ctx = await requirePermission('process:read');
    const url = new URL(request.url);

    // Sem `q`, devolve apenas o estado da integração e a lista de tribunais —
    // é o que a tela usa para se montar antes da primeira busca.
    if (!url.searchParams.get('q')) {
      return ok({ status: datajudStatus(), courts: DATAJUD_INDEXES });
    }

    await enforceRateLimit(RATE_LIMITS.search, await rateLimitIdentity(ctx.user.id));
    const params = parseQuery(request, querySchema);

    const result = await consultDatajud(ctx.organization.id, params.q, {
      court: params.court,
      limit: params.limit,
    });
    return ok(serialize<Record<string, unknown>>({ ...result, courts: DATAJUD_INDEXES }));
  });
}

const importSchema = z.object({
  processId: z.string().min(1).max(40),
  caseNumber: z.string().trim().min(3).max(60),
  court: z.string().trim().max(60).optional(),
});

/** Importa as movimentações de um processo do DataJud para a linha do tempo. */
export async function POST(request: Request) {
  return handle(request, 'datajud.import', async () => {
    const ctx = await requirePermission('process:write');
    const input = await parseJson(request, importSchema);

    await enforceRateLimit(RATE_LIMITS.search, await rateLimitIdentity(ctx.user.id));

    const consult = await consultDatajud(ctx.organization.id, input.caseNumber, {
      court: input.court,
      limit: 1,
    });
    if (consult.error) throw new ValidationError(consult.error);

    const found = consult.processes[0];
    if (!found) {
      throw new ValidationError(
        'O DataJud não retornou nenhum processo com esse número no tribunal selecionado.',
      );
    }

    const result = await importDatajudMovements(ctx.organization.id, input.processId, found);

    await audit({
      action: 'process.update',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'process',
      resourceId: input.processId,
      metadata: {
        source: 'datajud',
        index: consult.index,
        imported: result.imported,
        skipped: result.skipped,
        statusChanged: result.statusChanged,
      },
    });

    return ok({
      ...result,
      caseNumber: found.caseNumber,
      index: consult.index,
      situation: found.situation.label,
    });
  });
}
