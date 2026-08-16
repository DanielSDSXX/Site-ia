import { z } from 'zod';
import { created, handle, ok, parseJson, parseQuery } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { clientSchema } from '@/lib/validation';
import { createClient, listClients } from '@/server/workspace';
import { audit } from '@/lib/audit';

export async function GET(request: Request) {
  return handle(request, 'clients.list', async () => {
    const ctx = await requirePermission('client:read');
    const { q } = parseQuery(request, z.object({ q: z.string().trim().max(200).optional() }));
    return ok({ items: await listClients(ctx.organization.id, q) });
  });
}

export async function POST(request: Request) {
  return handle(request, 'clients.create', async () => {
    const ctx = await requirePermission('client:write');
    const input = await parseJson(request, clientSchema);
    const client = await createClient(ctx.organization.id, input);

    await audit({
      action: 'client.create',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'client',
      resourceId: client.id,
    });

    return created({ id: client.id, name: client.name });
  });
}
