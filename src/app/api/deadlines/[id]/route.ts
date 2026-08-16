import { handle, ok, parseJson } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { updateDeadlineSchema } from '@/lib/validation';
import { updateDeadline } from '@/server/workspace';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(request, 'deadlines.update', async () => {
    const ctx = await requirePermission('deadline:write');
    const { id } = await params;
    const input = await parseJson(request, updateDeadlineSchema);
    const deadline = await updateDeadline(ctx.organization.id, id, input);

    await audit({
      action: 'deadline.update',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'deadline',
      resourceId: id,
      metadata: { status: deadline.status },
    });

    return ok({ ok: true, status: deadline.status });
  });
}
