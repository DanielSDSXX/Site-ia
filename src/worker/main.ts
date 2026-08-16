/**
 * Processo worker dedicado.
 *   npm run worker
 *
 * Roda fora do servidor web para que a ingestão de documentos e as análises
 * não concorram com o atendimento de requisições.
 */
import { enqueue } from '@/lib/queue';
import { startWorker } from './runner';

async function main() {
  const worker = startWorker();

  // Manutenção periódica (limpeza de buckets de rate limit, jobs antigos).
  const maintenance = setInterval(
    () => {
      enqueue('maintenance.prune', {}).catch(() => undefined);
    },
    60 * 60 * 1000,
  );

  const shutdown = async (signal: string) => {
    console.log(`[worker] recebido ${signal}, encerrando...`);
    clearInterval(maintenance);
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[worker] falha fatal', err);
  process.exit(1);
});
