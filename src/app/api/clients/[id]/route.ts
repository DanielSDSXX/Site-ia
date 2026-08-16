import { handle, noContent, ok, parseJson } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { clientSchema } from '@/lib/validation';
import { deleteClient, getClient, updateClient } from '@/server/workspace';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handle(request, 'clients.get', async () => {
    const ctx = await requirePermission('client:read');
    const { id } = await params;
    return ok(await getClient(ctx.organization.id, id));
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(request, 'clients.update', async () => {
    const ctx = await requirePermission('client:write');
    const { id } = await params;
    const input = await parseJson(request, clientSchema.partial());
    await updateClient(ctx.organization.id, id, input);

    await audit({
      action: 'client.update',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'client',
      resourceId: id,
    });

    return ok({ ok: true });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(request, 'clients.delete', async () => {
    const ctx = await requirePermission('client:write');
    const { id } = await params;
    await deleteClient(ctx.organization.id, id);

    await audit({
      action: 'client.delete',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'client',
      resourceId: id,
    });

    return noContent();
  });
}
