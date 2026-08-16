import { handle, noContent, ok, parseJson } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { updateProcessSchema } from '@/lib/validation';
import { getProcessDetail, softDeleteProcess, updateProcess } from '@/server/processes';
import { audit } from '@/lib/audit';
import { serializeProcess } from '@/server/serialize';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handle(request, 'processes.get', async () => {
    const ctx = await requirePermission('process:read');
    const { id } = await params;
    const process = await getProcessDetail(ctx.organization.id, id);
    return ok(serializeProcess(process));
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(request, 'processes.update', async () => {
    const ctx = await requirePermission('process:write');
    const { id } = await params;
    const input = await parseJson(request, updateProcessSchema);
    await updateProcess(ctx.organization.id, id, input);

    await audit({
      action: 'process.update',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'process',
      resourceId: id,
      metadata: { fields: Object.keys(input) },
    });

    return ok({ ok: true });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(request, 'processes.delete', async () => {
    const ctx = await requirePermission('process:delete');
    const { id } = await params;
    await softDeleteProcess(ctx.organization.id, id);

    await audit({
      action: 'process.delete',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'process',
      resourceId: id,
    });

    return noContent();
  });
}
