import { handle, noContent, ok } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { getDocument, softDeleteDocument } from '@/server/documents';
import { serialize } from '@/server/serialize';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handle(request, 'documents.get', async () => {
    const ctx = await requirePermission('document:read');
    const { id } = await params;
    return ok(serialize(await getDocument(ctx.organization.id, id)));
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(request, 'documents.delete', async () => {
    const ctx = await requirePermission('document:delete');
    const { id } = await params;
    await softDeleteDocument(ctx.organization.id, id);

    await audit({
      action: 'document.delete',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'document',
      resourceId: id,
    });

    return noContent();
  });
}
