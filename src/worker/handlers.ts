import { AnalysisType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { processDocument } from '@/lib/documents/pipeline';
import { runAnalysis, runInitialAnalyses } from '@/lib/intelligence/analysis';
import { pruneRateLimitBuckets } from '@/lib/security/rate-limit';
import { reportProgress } from '@/lib/queue';

/**
 * Handlers dos jobs. Cada um recebe o payload já persistido e reporta
 * progresso para que a interface possa acompanhar sem travar.
 */

export type JobHandler = (
  payload: Record<string, unknown>,
  ctx: { jobId: string },
) => Promise<Record<string, unknown>>;

export const HANDLERS: Record<string, JobHandler> = {
  'document.process': async (payload, { jobId }) => {
    const documentId = String(payload.documentId ?? '');
    if (!documentId) throw new Error('document.process exige documentId.');

    const result = await processDocument(documentId, (percent, label) =>
      reportProgress(jobId, percent, label),
    );

    // Depois de indexar, dispara a análise inicial do processo (se houver).
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { processId: true, organizationId: true, uploadedById: true },
    });

    if (document?.processId && payload.runInitialAnalyses !== false) {
      const pending = await prisma.document.count({
        where: {
          processId: document.processId,
          deletedAt: null,
          status: { in: ['PENDING', 'EXTRACTING', 'NEEDS_OCR', 'CHUNKING', 'EMBEDDING'] },
        },
      });
      // Só analisa quando todos os documentos do lote terminaram.
      if (pending === 0) {
        await reportProgress(jobId, 98, 'Preparando inteligência');
        await runInitialAnalyses(
          document.organizationId,
          document.processId,
          document.uploadedById,
          (label) => reportProgress(jobId, 99, label),
        );
      }
    }

    return { ...result };
  },

  'analysis.run': async (payload) => {
    const organizationId = String(payload.organizationId ?? '');
    const processId = String(payload.processId ?? '');
    const type = String(payload.type ?? '') as AnalysisType;
    const userId = payload.userId ? String(payload.userId) : null;

    if (!organizationId || !processId || !type) {
      throw new Error('analysis.run exige organizationId, processId e type.');
    }

    const result = await runAnalysis({ organizationId, processId, type, userId });
    return { ...result };
  },

  'process.analyze': async (payload, { jobId }) => {
    const organizationId = String(payload.organizationId ?? '');
    const processId = String(payload.processId ?? '');
    const userId = payload.userId ? String(payload.userId) : null;

    await runInitialAnalyses(organizationId, processId, userId, (label) =>
      reportProgress(jobId, 50, label),
    );
    return { processId };
  },

  'maintenance.prune': async () => {
    const removedBuckets = await pruneRateLimitBuckets();
    const { count: removedJobs } = await prisma.job.deleteMany({
      where: {
        status: { in: ['COMPLETED', 'FAILED'] },
        completedAt: { lt: new Date(Date.now() - 7 * 86_400_000) },
      },
    });
    const { count: removedSessions } = await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
    });
    return { removedBuckets, removedJobs, removedSessions };
  },
};
