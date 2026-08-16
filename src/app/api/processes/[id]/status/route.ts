import { handle, ok } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { processingStatus } from '@/server/documents';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

/**
 * Estado de processamento do processo: usado pelo polling da interface
 * enquanto documentos são indexados e análises rodam.
 */
export async function GET(request: Request, { params }: Params) {
  return handle(request, 'processes.status', async () => {
    const ctx = await requirePermission('process:read');
    const { id } = await params;

    const [status, runningAnalyses, process] = await Promise.all([
      processingStatus(ctx.organization.id, id),
      prisma.aIAnalysis.findMany({
        where: { organizationId: ctx.organization.id, processId: id, status: { in: ['QUEUED', 'RUNNING'] } },
        select: { id: true, type: true, status: true, startedAt: true },
      }),
      prisma.process.findFirst({
        where: { id, organizationId: ctx.organization.id },
        select: { lastAnalyzedAt: true, riskLevel: true, riskScore: true },
      }),
    ]);

    const analysisJobs = await prisma.job.findMany({
      where: {
        organizationId: ctx.organization.id,
        type: 'analysis.run',
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      select: { id: true, payload: true, progressLabel: true, status: true },
    });

    return ok({
      ...status,
      runningAnalyses,
      analysisJobs: analysisJobs.filter(
        (job) => (job.payload as { processId?: string })?.processId === id,
      ),
      process,
      idle:
        status.done &&
        runningAnalyses.length === 0 &&
        analysisJobs.every((job) => (job.payload as { processId?: string })?.processId !== id),
    });
  });
}
