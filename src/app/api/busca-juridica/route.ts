import { z } from 'zod';
import { handle, ok, parseQuery, rateLimitIdentity } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { searchLegal } from '@/server/legal-search';
import { serialize } from '@/server/serialize';
import { DATAJUD_INDEXES, datajudStatus } from '@/lib/integrations/datajud';

/**
 * Busca jurídica unificada: número do processo ou palavra-chave.
 *
 * Devolve, numa resposta só, os PROCESSOS encontrados no CNJ e os
 * ENTENDIMENTOS do acervo do escritório — cada grupo identificado por origem.
 */

const querySchema = z.object({
  q: z.string().trim().min(1, 'Digite o número do processo ou uma palavra-chave.').max(200),
  court: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  includeDemo: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) =>
      typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes((v ?? '').toLowerCase()),
    ),
});

export async function GET(request: Request) {
  return handle(request, 'busca.juridica', async () => {
    const ctx = await requirePermission('jurisprudence:read');
    const url = new URL(request.url);

    // Sem `q`, a tela só quer saber como se montar: estado da integração e
    // lista de tribunais.
    if (!url.searchParams.get('q')) {
      return ok({ status: datajudStatus(), courts: DATAJUD_INDEXES });
    }

    await enforceRateLimit(RATE_LIMITS.search, await rateLimitIdentity(ctx.user.id));
    const params = parseQuery(request, querySchema);

    const result = await searchLegal(ctx.organization.id, params.q, {
      court: params.court,
      limit: params.limit,
      includeDemo: params.includeDemo,
    });

    return ok(serialize<Record<string, unknown>>({ ...result, courts: DATAJUD_INDEXES }));
  });
}
