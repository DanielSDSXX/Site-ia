import { z } from 'zod';
import { created, handle, ok, parseJson, parseQuery } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { taskSchema } from '@/lib/validation';
import { createTask, listTasks, taskFromFinding } from '@/server/workspace';
import { audit } from '@/lib/audit';

const querySchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELED']).optional(),
  assigneeId: z.string().max(40).optional(),
  processId: z.string().max(40).optional(),
});

export async function GET(request: Request) {
  return handle(request, 'tasks.list', async () => {
    const ctx = await requirePermission('task:read');
    const filters = parseQuery(request, querySchema);
    return ok({ items: await listTasks(ctx.organization.id, filters) });
  });
}

const bodySchema = z.union([taskSchema, z.object({ fromFindingId: z.string().min(1).max(40) })]);

export async function POST(request: Request) {
  return handle(request, 'tasks.create', async () => {
    const ctx = await requirePermission('task:write');
    const input = await parseJson(request, bodySchema);

    const task =
      'fromFindingId' in input
        ? await taskFromFinding(ctx.organization.id, ctx.user.id, input.fromFindingId)
        : await createTask(ctx.organization.id, ctx.user.id, input);

    await audit({
      action: 'task.create',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'task',
      resourceId: task.id,
    });

    return created({ id: task.id, title: task.title });
  });
}
