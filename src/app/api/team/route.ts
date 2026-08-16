import { z } from 'zod';
import { handle, noContent, ok, parseJson, parseQuery } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { roleSchema } from '@/lib/validation';
import { changeMemberRole, listMembers, removeMember } from '@/server/workspace';
import { audit } from '@/lib/audit';

export async function GET(request: Request) {
  return handle(request, 'team.list', async () => {
    const ctx = await requirePermission('team:read');
    return ok({ members: await listMembers(ctx.organization.id) });
  });
}

const patchSchema = z.object({ membershipId: z.string().min(1).max(40), role: roleSchema });

export async function PATCH(request: Request) {
  return handle(request, 'team.changeRole', async () => {
    const ctx = await requirePermission('team:manage');
    const { membershipId, role } = await parseJson(request, patchSchema);
    await changeMemberRole(ctx.organization.id, membershipId, role);

    await audit({
      action: 'member.role_change',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'membership',
      resourceId: membershipId,
      metadata: { role },
    });

    return ok({ ok: true });
  });
}

export async function DELETE(request: Request) {
  return handle(request, 'team.remove', async () => {
    const ctx = await requirePermission('team:manage');
    const { membershipId } = parseQuery(request, z.object({ membershipId: z.string().min(1).max(40) }));
    await removeMember(ctx.organization.id, membershipId);

    await audit({
      action: 'member.remove',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'membership',
      resourceId: membershipId,
    });

    return noContent();
  });
}
