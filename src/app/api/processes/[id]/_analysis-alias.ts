import type { AnalysisType } from '@prisma/client';
import { handle, ok, rateLimitIdentity } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { enqueue } from '@/lib/queue';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { assertCreditBalance } from '@/server/quota';
import { audit } from '@/lib/audit';
import { ensureInlineWorker } from '@/worker/runner';

/**
 * Atalhos REST para as análises destacadas na interface
 * (/vulnerabilities, /adversarial-analysis, /simulate...).
 *
 * Todos delegam ao mesmo orquestrador de /analyze — existem para dar nomes
 * estáveis e legíveis às ações principais do produto.
 */
export function analysisAliasHandler(type: AnalysisType, scope: string) {
  return async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return handle(request, scope, async () => {
      const ctx = await requirePermission('analysis:run');
      const { id } = await params;

      await enforceRateLimit(RATE_LIMITS.analysis, await rateLimitIdentity(ctx.user.id));
      await assertCreditBalance(ctx.organization.id);

      await audit({
        action: 'analysis.run',
        userId: ctx.user.id,
        organizationId: ctx.organization.id,
        resourceType: 'process',
        resourceId: id,
        metadata: { type },
      });

      ensureInlineWorker();
      const job = await enqueue(
        'analysis.run',
        { organizationId: ctx.organization.id, processId: id, type, userId: ctx.user.id },
        { organizationId: ctx.organization.id, priority: 8 },
      );

      return ok({ queued: true, jobId: job.id, type });
    });
  };
}
