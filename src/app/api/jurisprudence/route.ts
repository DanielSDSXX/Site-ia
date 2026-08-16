import { created, handle, ok, parseJson, parseQuery, rateLimitIdentity } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { jurisprudenceImportSchema, jurisprudenceSearchSchema } from '@/lib/validation';
import { importJurisprudence, listJurisprudence, searchJurisprudence } from '@/server/jurisprudence';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { audit } from '@/lib/audit';

export async function GET(request: Request) {
  return handle(request, 'jurisprudence.search', async () => {
    const ctx = await requirePermission('jurisprudence:read');
    const url = new URL(request.url);

    if (!url.searchParams.get('q')) {
      return ok({ items: await listJurisprudence(ctx.organization.id) });
    }

    await enforceRateLimit(RATE_LIMITS.search, await rateLimitIdentity(ctx.user.id));
    const params = parseQuery(request, jurisprudenceSearchSchema);
    return ok({ results: await searchJurisprudence(ctx.organization.id, params) });
  });
}

/**
 * Importa uma decisão. `sourceUrl` é obrigatório por regra de produto: a
 * plataforma não guarda jurisprudência que não possa ser conferida na origem.
 */
export async function POST(request: Request) {
  return handle(request, 'jurisprudence.import', async () => {
    const ctx = await requirePermission('jurisprudence:write');
    const input = await parseJson(request, jurisprudenceImportSchema);
    const item = await importJurisprudence(ctx.organization.id, input);

    await audit({
      action: 'jurisprudence.import',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'jurisprudence',
      resourceId: item.id,
      metadata: { court: item.court, caseNumber: item.caseNumber },
    });

    return created({ id: item.id });
  });
}
