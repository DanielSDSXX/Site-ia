import { handle, ok, parseQuery, rateLimitIdentity } from '@/lib/api';
import { requireAuth } from '@/lib/auth/session';
import { globalSearchSchema } from '@/lib/validation';
import { globalSearch } from '@/server/dashboard';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';

export async function GET(request: Request) {
  return handle(request, 'search.global', async () => {
    const ctx = await requireAuth();
    await enforceRateLimit(RATE_LIMITS.search, await rateLimitIdentity(ctx.user.id));

    const { q, limit } = parseQuery(request, globalSearchSchema);
    const results = await globalSearch(ctx.organization.id, q, limit);
    return ok({ results });
  });
}
