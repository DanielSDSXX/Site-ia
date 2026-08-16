import { AnalysisType } from '@prisma/client';
import { handle, ok, parseJson, rateLimitIdentity } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { analysisRequestSchema } from '@/lib/validation';
import { runAnalysis } from '@/lib/intelligence/analysis';
import { enqueue } from '@/lib/queue';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { assertCreditBalance } from '@/server/quota';
import { audit } from '@/lib/audit';
import { ensureInlineWorker } from '@/worker/runner';

type Params = { params: Promise<{ id: string }> };

/**
 * Dispara uma análise.
 *
 * Por padrão a execução é assíncrona (retorna jobId e a interface acompanha),
 * porque uma análise completa pode levar dezenas de segundos. `async: false`
 * roda inline — usado pelos testes e por análises rápidas.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(request, 'analysis.run', async () => {
    const ctx = await requirePermission('analysis:run');
    const { id } = await params;

    await enforceRateLimit(RATE_LIMITS.analysis, await rateLimitIdentity(ctx.user.id));
    await assertCreditBalance(ctx.organization.id);

    const input = await parseJson(request, analysisRequestSchema);

    await audit({
      action: 'analysis.run',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'process',
      resourceId: id,
      metadata: { type: input.type },
    });

    if (input.async) {
      ensureInlineWorker();
      const job = await enqueue(
        'analysis.run',
        {
          organizationId: ctx.organization.id,
          processId: id,
          type: input.type,
          userId: ctx.user.id,
        },
        { organizationId: ctx.organization.id, priority: 8 },
      );
      return ok({ queued: true, jobId: job.id });
    }

    const result = await runAnalysis({
      organizationId: ctx.organization.id,
      processId: id,
      type: input.type as AnalysisType,
      userId: ctx.user.id,
      instructions: input.instructions,
    });

    return ok({ queued: false, ...result });
  });
}
