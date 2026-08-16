import { prisma } from '@/lib/db';
import { handle, ok } from '@/lib/api';
import { requireAuth } from '@/lib/auth/session';
import { NotFoundError } from '@/lib/errors';

type Params = { params: Promise<{ id: string }> };

/** Progresso de um job — consultado pela interface durante o processamento. */
export async function GET(request: Request, { params }: Params) {
  return handle(request, 'jobs.get', async () => {
    const ctx = await requireAuth();
    const { id } = await params;

    const job = await prisma.job.findFirst({
      where: { id, organizationId: ctx.organization.id },
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        progressLabel: true,
        attempts: true,
        maxAttempts: true,
        lastError: true,
        result: true,
        createdAt: true,
        completedAt: true,
      },
    });
    if (!job) throw new NotFoundError('Job não encontrado.');

    return ok({
      ...job,
      // Erros internos não vazam para a interface.
      lastError: job.lastError ? 'A operação falhou. Nossa equipe registrou o erro.' : null,
    });
  });
}
