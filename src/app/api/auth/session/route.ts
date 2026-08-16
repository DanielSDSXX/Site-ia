import { z } from 'zod';
import { handle, ok, parseJson } from '@/lib/api';
import { getAuthContext, listUserOrganizations, requireAuth, switchOrganization } from '@/lib/auth/session';
import { permissionsFor } from '@/lib/auth/permissions';
import { audit } from '@/lib/audit';

export async function GET(request: Request) {
  return handle(request, 'auth.session', async () => {
    const ctx = await getAuthContext();
    if (!ctx) return ok({ authenticated: false });

    return ok({
      authenticated: true,
      user: ctx.user,
      organization: ctx.organization,
      role: ctx.role,
      permissions: permissionsFor(ctx.role),
      organizations: await listUserOrganizations(ctx.user.id),
    });
  });
}

const switchSchema = z.object({ organizationId: z.string().min(1) });

/** Troca o escritório ativo da sessão. */
export async function POST(request: Request) {
  return handle(request, 'auth.switchOrg', async () => {
    const ctx = await requireAuth();
    const { organizationId } = await parseJson(request, switchSchema);

    const organizations = await listUserOrganizations(ctx.user.id);
    if (!organizations.some((o) => o.id === organizationId)) {
      return ok({ ok: false, message: 'Você não participa deste escritório.' }, { status: 403 });
    }

    await switchOrganization(ctx.sessionId, organizationId);
    await audit({ action: 'org.switch', userId: ctx.user.id, organizationId });

    return ok({ ok: true });
  });
}
