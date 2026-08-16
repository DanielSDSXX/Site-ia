import { created, handle, ok, rateLimitIdentity } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { listDocuments, uploadDocument } from '@/server/documents';
import { assertDocumentQuota } from '@/server/quota';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { ValidationError } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { ensureInlineWorker } from '@/worker/runner';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handle(request, 'documents.listByProcess', async () => {
    const ctx = await requirePermission('document:read');
    const { id } = await params;
    return ok(await listDocuments(ctx.organization.id, { processId: id, pageSize: 100 }));
  });
}

/**
 * Upload multipart. Aceita vários arquivos numa única requisição — o usuário
 * arrasta o processo inteiro de uma vez.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(request, 'documents.upload', async () => {
    const ctx = await requirePermission('document:upload');
    const { id } = await params;

    await enforceRateLimit(RATE_LIMITS.upload, await rateLimitIdentity(ctx.user.id));

    const form = await request.formData().catch(() => null);
    if (!form) throw new ValidationError('Envio inválido: use multipart/form-data.');

    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new ValidationError('Nenhum arquivo enviado.');
    if (files.length > 30) throw new ValidationError('Envie no máximo 30 arquivos por vez.');

    ensureInlineWorker();

    const results = [];
    const errors: { filename: string; message: string }[] = [];

    for (const file of files) {
      try {
        await assertDocumentQuota(ctx.organization.id);
        const result = await uploadDocument({
          organizationId: ctx.organization.id,
          userId: ctx.user.id,
          processId: id,
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
            metadata: { filename: file.name, size: file.size, processId: id },
          });
        }
      } catch (err) {
        errors.push({
          filename: file.name,
          message: err instanceof Error ? err.message : 'Falha no envio.',
        });
      }
    }

    if (results.length === 0) {
      throw new ValidationError('Nenhum arquivo pôde ser enviado.', errors);
    }

    return created({ documents: results, errors });
  });
}
