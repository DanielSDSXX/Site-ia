import { z } from 'zod';
import { created, handle, noContent, ok, parseJson, parseQuery } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { memoryItemSchema } from '@/lib/validation';
import { createMemoryItem, deleteMemoryItem, listMemoryItems, toggleMemoryItem } from '@/server/memory';
import { audit } from '@/lib/audit';

export async function GET(request: Request) {
  return handle(request, 'memory.list', async () => {
    const ctx = await requirePermission('memory:read');
    const { kind } = parseQuery(request, z.object({ kind: z.string().max(40).optional() }));
    return ok({ items: await listMemoryItems(ctx.organization.id, kind) });
  });
}

export async function POST(request: Request) {
  return handle(request, 'memory.create', async () => {
    const ctx = await requirePermission('memory:write');
    const input = await parseJson(request, memoryItemSchema);
    const item = await createMemoryItem(ctx.organization.id, input);

    await audit({
      action: 'memory.create',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'memory',
      resourceId: item.id,
      metadata: { kind: item.kind },
    });

    return created({ id: item.id });
  });
}

const patchSchema = z.object({ id: z.string().min(1).max(40), enabled: z.boolean() });

export async function PATCH(request: Request) {
  return handle(request, 'memory.toggle', async () => {
    const ctx = await requirePermission('memory:write');
    const { id, enabled } = await parseJson(request, patchSchema);
    await toggleMemoryItem(ctx.organization.id, id, enabled);
    return ok({ ok: true });
  });
}

export async function DELETE(request: Request) {
  return handle(request, 'memory.delete', async () => {
    const ctx = await requirePermission('memory:write');
    const { id } = parseQuery(request, z.object({ id: z.string().min(1).max(40) }));
    await deleteMemoryItem(ctx.organization.id, id);

    await audit({
      action: 'memory.delete',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'memory',
      resourceId: id,
    });

    return noContent();
  });
}
