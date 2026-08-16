import { inviteSchema } from '@/lib/validation';
import { sendTeamInvite } from '@/server/team';
import { requireAuth } from '@/lib/auth/session';
import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';

/**
 * POST /api/team/invite
 *
 * Convida um novo membro para a equipe.
 * Requer permissão ADMIN ou OWNER na organização.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();

    // Verificar se o usuário tem permissão para convidar (ADMIN ou OWNER)
    if (!['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json(
        { error: 'Você não tem permissão para convidar membros' },
        { status: 403 }
      );
    }

    const input = inviteSchema.parse(await request.json());

    const invite = await sendTeamInvite({
      organizationId: auth.organization.id,
      email: input.email,
      role: input.role,
    });

    return NextResponse.json({
      success: true,
      inviteId: invite.id,
      email: invite.email,
      message: `Convite enviado para ${invite.email}`,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('já')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Erro ao enviar convite:', error);
    return NextResponse.json(
      { error: 'Falha ao enviar convite' },
      { status: 500 }
    );
  }
}
