import { handle, ok } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { reprocessDocument } from '@/server/documents';
import { ensureInlineWorker } from '@/worker/runner';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  return handle(request, 'documents.reprocess', async () => {
    const ctx = await requirePermission('document:upload');
    const { id } = await params;
    ensureInlineWorker();
    const job = await reprocessDocument(ctx.organization.id, id);
    return ok({ jobId: job.id });
  });
}
