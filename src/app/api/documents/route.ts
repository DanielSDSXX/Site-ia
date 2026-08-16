import { z } from 'zod';
import { created, handle, ok, parseQuery, rateLimitIdentity } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { listDocuments, uploadDocument } from '@/server/documents';
import { assertDocumentQuota } from '@/server/quota';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { ValidationError } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { ensureInlineWorker } from '@/worker/runner';

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  processId: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(30),
});

export async function GET(request: Request) {
  return handle(request, 'documents.list', async () => {
    const ctx = await requirePermission('document:read');
    const query = parseQuery(request, querySchema);
    return ok(
      await listDocuments(ctx.organization.id, {
        q: query.q,
        processId: query.processId,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  });
}

/** Upload sem processo vinculado (biblioteca geral do escritório). */
export async function POST(request: Request) {
  return handle(request, 'documents.uploadLoose', async () => {
    const ctx = await requirePermission('document:upload');
    await enforceRateLimit(RATE_LIMITS.upload, await rateLimitIdentity(ctx.user.id));

    const form = await request.formData().catch(() => null);
    if (!form) throw new ValidationError('Envio inválido: use multipart/form-data.');

    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new ValidationError('Nenhum arquivo enviado.');

    const processId = form.get('processId');
    ensureInlineWorker();

    const results = [];
    for (const file of files) {
      await assertDocumentQuota(ctx.organization.id);
      const result = await uploadDocument({
        organizationId: ctx.organization.id,
        userId: ctx.user.id,
        processId: typeof processId === 'string' && processId ? processId : null,
        file,
      });
      results.push(result);
      if (!result.duplicated) {
        await audit({
          action: 'document.upload',
          userId: ctx.user.id,
          organizationId: ctx.organization.id,
          resourceType: 'document',
          resourceId: result.documentId,
          metadata: { filename: file.name, size: file.size },
        });
      }
    }

    return created({ documents: results });
  });
}
