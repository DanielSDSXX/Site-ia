import { handle, noContent, ok, parseJson } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { updateTaskSchema } from '@/lib/validation';
import { deleteTask, updateTask } from '@/server/workspace';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(request, 'tasks.update', async () => {
    const ctx = await requirePermission('task:write');
    const { id } = await params;
    const input = await parseJson(request, updateTaskSchema);
    const task = await updateTask(ctx.organization.id, id, input);

    await audit({
      action: 'task.update',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'task',
      resourceId: id,
      metadata: { status: task.status },
    });

    return ok({ ok: true, status: task.status });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(request, 'tasks.delete', async () => {
    const ctx = await requirePermission('task:write');
    const { id } = await params;
    await deleteTask(ctx.organization.id, id);
    return noContent();
  });
}
