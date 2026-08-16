import { z } from 'zod';
import { handle, ok, parseQuery } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { getDocumentPages, getPageText } from '@/server/documents';

type Params = { params: Promise<{ id: string }> };

const querySchema = z.object({ page: z.coerce.number().int().min(1).optional() });

export async function GET(request: Request, { params }: Params) {
  return handle(request, 'documents.pages', async () => {
    const ctx = await requirePermission('document:read');
    const { id } = await params;
    const { page } = parseQuery(request, querySchema);

    if (page) {
      return ok(await getPageText(ctx.organization.id, id, page));
    }
    return ok({ pages: await getDocumentPages(ctx.organization.id, id) });
  });
}
