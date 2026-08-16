import { handle, ok, parseJson } from '@/lib/api';
import { destroyCurrentSession, requireAuth } from '@/lib/auth/session';
import { changePasswordSchema } from '@/lib/validation';
import { changePassword, deleteAccount, exportUserData } from '@/server/accounts';
import { audit } from '@/lib/audit';

/** Exportação dos dados do usuário (LGPD, art. 18, V). */
export async function GET(request: Request) {
  return handle(request, 'account.export', async () => {
    const ctx = await requireAuth();
    const data = await exportUserData(ctx.user.id, ctx.organization.id);

    await audit({
      action: 'data.export',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
    });

    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'content-type': 'application/json',
        'content-disposition': 'attachment; filename="legalmind-meus-dados.json"',
        'cache-control': 'private, no-store',
      },
    });
  });
}

export async function PATCH(request: Request) {
  return handle(request, 'account.password', async () => {
    const ctx = await requireAuth();
    const input = await parseJson(request, changePasswordSchema);
    await changePassword(ctx.user.id, input.currentPassword, input.newPassword);

    await audit({
      action: 'auth.password_change',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
    });

    return ok({ ok: true });
  });
}

/** Exclusão de conta (LGPD, art. 18, VI). */
export async function DELETE(request: Request) {
  return handle(request, 'account.delete', async () => {
    const ctx = await requireAuth();

    await audit({
      action: 'account.delete_request',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
    });

    await deleteAccount(ctx.user.id);
    await destroyCurrentSession();

    return ok({ ok: true });
  });
}
