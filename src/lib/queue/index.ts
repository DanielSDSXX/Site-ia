import { JobStatus, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logError } from '@/lib/errors';

/**
 * Fila de trabalhos durável em PostgreSQL.
 *
 * Por que não Redis/BullMQ: a plataforma já depende do Postgres e o volume de
 * jobs (processamento de documentos e análises) é da ordem de dezenas por
 * minuto por instância — muito abaixo do ponto em que uma fila em banco vira
 * gargalo. Em contrapartida ganhamos durabilidade transacional, inspeção via
 * SQL e um componente a menos para operar. A interface abaixo é a fronteira:
 * trocar por Redis significa reimplementar `enqueue`/`claimNext`.
 */

export type JobType =
  | 'document.process'
  | 'process.analyze'
  | 'analysis.run'
  | 'maintenance.prune';

export interface EnqueueOptions {
  organizationId?: string | null;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
}

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
) {
  return prisma.job.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      organizationId: options.organizationId ?? null,
      priority: options.priority ?? 0,
      runAt: options.runAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 3,
    },
  });
}

/**
 * Reivindica o próximo job pronto para execução.
 *
 * `FOR UPDATE SKIP LOCKED` garante que dois workers concorrentes nunca peguem
 * o mesmo job, sem serializar a fila inteira.
 */
export async function claimNextJob(workerId: string) {
  const rows = await prisma.$queryRaw<
    { id: string; type: string; payload: unknown; attempts: number; maxAttempts: number }[]
  >`
    UPDATE "jobs"
    SET "status" = 'RUNNING',
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "attempts" = "jobs"."attempts" + 1,
        "updatedAt" = NOW()
    WHERE "id" = (
      SELECT "id" FROM "jobs"
      WHERE "status" = 'QUEUED' AND "runAt" <= NOW()
      ORDER BY "priority" DESC, "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"
  `;
  return rows[0] ?? null;
}

export async function reportProgress(jobId: string, progress: number, label?: string) {
  await prisma.job
    .update({
      where: { id: jobId },
      data: { progress: Math.max(0, Math.min(100, Math.round(progress))), progressLabel: label ?? null },
    })
    .catch((err) => logError('queue.progress', err, { jobId }));
}

export async function completeJob(jobId: string, result?: Record<string, unknown>) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.COMPLETED,
      progress: 100,
      completedAt: new Date(),
      lockedBy: null,
      lockedAt: null,
      result: (result ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/** Falha um job: reagenda com backoff exponencial até esgotar as tentativas. */
export async function failJob(jobId: string, error: unknown, attempts: number, maxAttempts: number) {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = attempts >= maxAttempts;
  const backoffMs = Math.min(60_000 * 2 ** (attempts - 1), 15 * 60_000);

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: exhausted ? JobStatus.FAILED : JobStatus.QUEUED,
      lastError: message.slice(0, 1000),
      lockedAt: null,
      lockedBy: null,
      runAt: exhausted ? undefined : new Date(Date.now() + backoffMs),
      completedAt: exhausted ? new Date() : null,
    },
  });
}

/**
 * Devolve à fila jobs cujo worker morreu (lock expirado).
 * Chamado no início de cada ciclo do worker.
 */
export async function requeueStaleJobs(staleAfterMs = 10 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const { count } = await prisma.job.updateMany({
    where: { status: JobStatus.RUNNING, lockedAt: { lt: cutoff } },
    data: { status: JobStatus.QUEUED, lockedAt: null, lockedBy: null },
  });
  return count;
}

export async function getJob(jobId: string) {
  return prisma.job.findUnique({ where: { id: jobId } });
}
