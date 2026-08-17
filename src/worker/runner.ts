import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { logError } from '@/lib/errors';
import { claimNextJob, completeJob, failJob, requeueStaleJobs } from '@/lib/queue';
import { HANDLERS } from './handlers';

/**
 * Loop do worker.
 *
 * Faz polling na tabela `jobs`. O intervalo é curto quando há trabalho e
 * cresce quando a fila está vazia, para não martelar o banco à toa.
 */

const IDLE_MIN_MS = 500;
const IDLE_MAX_MS = 5_000;

export interface WorkerHandle {
  stop: () => Promise<void>;
  id: string;
}

export function startWorker(options: { concurrency?: number } = {}): WorkerHandle {
  const concurrency = options.concurrency ?? env().QUEUE_CONCURRENCY;
  const workerId = `${process.pid}-${randomUUID().slice(0, 8)}`;
  let running = true;
  const loops: Promise<void>[] = [];

  const loop = async (slot: number) => {
    let idle = IDLE_MIN_MS;
    let failures = 0;

    while (running) {
      try {
        // Só o primeiro slot cuida da manutenção de locks órfãos.
        if (slot === 0 && Math.random() < 0.02) {
          await requeueStaleJobs().catch(() => 0);
        }

        const job = await claimNextJob(workerId);
        failures = 0; // conseguimos falar com o banco

        if (!job) {
          await sleep(idle);
          idle = Math.min(IDLE_MAX_MS, Math.round(idle * 1.5));
          continue;
        }

        idle = IDLE_MIN_MS;
        const handler = HANDLERS[job.type];

        if (!handler) {
          await failJob(job.id, new Error(`Job desconhecido: ${job.type}`), job.attempts, job.maxAttempts);
          continue;
        }

        try {
          const result = await handler((job.payload ?? {}) as Record<string, unknown>, { jobId: job.id });
          await completeJob(job.id, result);
        } catch (err) {
          logError('worker.job', err, { jobId: job.id, type: job.type, attempt: job.attempts });
          await failJob(job.id, err, job.attempts, job.maxAttempts);
        }
      } catch (err) {
        /*
          Falha aqui é quase sempre o banco fora do ar. Antes, cada slot
          registrava o stack inteiro a cada 2s: com o Postgres parado o
          terminal virava um muro de texto e escondia o erro que o
          desenvolvedor estava procurando.

          Agora só o primeiro erro e depois um a cada dez, com espera
          crescente até 30s. O worker continua tentando — quando o banco
          voltar, `failures` zera e o ritmo normal é retomado.
        */
        failures++;
        if (failures === 1 || failures % 10 === 0) {
          logError('worker.loop', err, { slot, consecutiveFailures: failures });
        }
        await sleep(Math.min(30_000, 2000 * 2 ** Math.min(failures - 1, 4)));
      }
    }
  };

  for (let slot = 0; slot < concurrency; slot++) {
    loops.push(loop(slot));
  }

  console.log(`[worker] iniciado (id=${workerId}, concorrência=${concurrency})`);

  return {
    id: workerId,
    stop: async () => {
      running = false;
      await Promise.allSettled(loops);
      console.log(`[worker] parado (id=${workerId})`);
    },
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Worker embutido no processo do Next (dev / deploy single-node)
// ---------------------------------------------------------------------------

const globalForWorker = globalThis as unknown as { legalmindWorker?: WorkerHandle };

/**
 * Garante que exista um worker rodando no mesmo processo da aplicação.
 * Em produção com múltiplas instâncias, prefira `npm run worker` num
 * processo dedicado e mantenha QUEUE_INLINE_WORKER=false.
 */
export function ensureInlineWorker() {
  if (!env().QUEUE_INLINE_WORKER) return;
  if (globalForWorker.legalmindWorker) return;
  globalForWorker.legalmindWorker = startWorker({ concurrency: env().QUEUE_CONCURRENCY });
}
