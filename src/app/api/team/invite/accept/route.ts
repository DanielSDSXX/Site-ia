import { acceptInvite } from '@/server/team';
import { requireAuth } from '@/lib/auth/session';
import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';

/**
 * POST /api/team/invite/accept
 *
 * Aceita um convite de equipe.
 * Requer apenas token válido e usuário autenticado.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const { token } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Token de convite é obrigatório' },
        { status: 400 }
      );
    }

    const { membership, invite } = await acceptInvite(token, auth.user.id);

    return NextResponse.json({
      success: true,
      membership,
      organizationId: invite.organizationId,
      message: 'Convite aceito com sucesso!',
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('expirado')) {
      return NextResponse.json({ error: error.message }, { status: 410 });
    }
    console.error('Erro ao aceitar convite:', error);
    return NextResponse.json(
      { error: 'Falha ao aceitar convite' },
      { status: 500 }
    );
  }
}
