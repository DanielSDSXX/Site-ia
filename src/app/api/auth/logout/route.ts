import { handle, ok } from '@/lib/api';
import { destroyCurrentSession, getAuthContext } from '@/lib/auth/session';
import { audit } from '@/lib/audit';

export async function POST(request: Request) {
  return handle(request, 'auth.logout', async () => {
    const ctx = await getAuthContext();
    await destroyCurrentSession();
    if (ctx) {
      await audit({
        action: 'auth.logout',
        userId: ctx.user.id,
        organizationId: ctx.organization.id,
      });
    }
    return ok({ ok: true });
  });
}
