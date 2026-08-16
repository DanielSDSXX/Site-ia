import { created, handle, ok, parseJson, parseQuery } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { createProcessSchema, processFiltersSchema } from '@/lib/validation';
import { createProcess, listProcesses } from '@/server/processes';
import { audit } from '@/lib/audit';
import { assertProcessQuota } from '@/server/quota';

export async function GET(request: Request) {
  return handle(request, 'processes.list', async () => {
    const ctx = await requirePermission('process:read');
    const filters = parseQuery(request, processFiltersSchema);
    const result = await listProcesses(ctx.organization.id, filters);
    return ok(result);
  });
}

export async function POST(request: Request) {
  return handle(request, 'processes.create', async () => {
    const ctx = await requirePermission('process:write');
    await assertProcessQuota(ctx.organization.id);

    const input = await parseJson(request, createProcessSchema);
    const process = await createProcess(ctx.organization.id, ctx.user.id, input);

    await audit({
      action: 'process.create',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'process',
      resourceId: process.id,
      metadata: { number: process.number },
    });

    return created({ id: process.id, number: process.number });
  });
}
