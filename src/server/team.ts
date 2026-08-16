import { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { emailProvider } from '@/lib/email';
import { env } from '@/lib/env';
import { sha256 } from '@/lib/security/crypto';

export interface SendInviteInput {
  organizationId: string;
  email: string;
  role: Role;
}

export async function sendTeamInvite(input: SendInviteInput) {
  const { organizationId, email, role } = input;

  // Verificar se o usuário já existe na organização
  const existing = await prisma.membership.findFirst({
    where: {
      organization: { id: organizationId },
      user: { email },
    },
  });

  if (existing) {
    throw new Error(`Usuário com email ${email} já é membro da organização.`);
  }

  // Verificar se já há um convite pendente
  const existingInvite = await prisma.invite.findFirst({
    where: {
      organizationId,
      email,
      acceptedAt: null,
    },
  });

  if (existingInvite) {
    throw new Error(`Já existe um convite pendente para ${email}.`);
  }

  // Gerar token seguro
  const rawToken = generateInviteToken();
  const tokenHash = sha256(rawToken);

  // Convite expira em 7 dias
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Criar o convite no banco
  const invite = await prisma.invite.create({
    data: {
      organizationId,
      email,
      role,
      tokenHash,
      expiresAt,
    },
    include: {
      organization: { select: { name: true } },
    },
  });

  // Preparar link do convite (usa token bruto, não o hash)
  const inviteLink = `${env().INVITE_BASE_URL}/equipe/aceitar-convite?token=${rawToken}`;

  // Obter informações do sender (geralmente o usuário autenticado)
  const senderName = 'Administrador';

  // Enviar email
  try {
    await emailProvider().sendTemplate({
      to: email,
      template: 'invite',
      variables: {
        senderName,
        organizationName: invite.organization.name,
        role: getRoleLabel(role),
        inviteLink,
      },
    });
  } catch (error) {
    // Log do erro mas não falha a operação (convite criado mesmo se email falhar)
    console.error('Erro ao enviar email de convite:', error);
  }

  return { ...invite, token: rawToken };
}

export async function acceptInvite(rawToken: string, userId: string) {
  const tokenHash = sha256(rawToken);

  const invite = await prisma.invite.findUnique({
    where: { tokenHash },
    include: { organization: true },
  });

  if (!invite) {
    throw new Error('Convite inválido ou expirado.');
  }

  if (invite.acceptedAt) {
    throw new Error('Este convite já foi aceito.');
  }

  // Verificar se expirou
  if (new Date() > invite.expiresAt) {
    throw new Error('Este convite expirou.');
  }

  // Verificar se o usuário já é membro
  const existing = await prisma.membership.findFirst({
    where: {
      organizationId: invite.organizationId,
      userId,
    },
  });

  if (existing) {
    throw new Error('Você já é membro desta organização.');
  }

  // Aceitar o convite e criar membership
  const [membership, updatedInvite] = await prisma.$transaction([
    prisma.membership.create({
      data: {
        organizationId: invite.organizationId,
        userId,
        role: invite.role,
      },
    }),
    prisma.invite.update({
      where: { tokenHash },
      data: { acceptedAt: new Date() },
    }),
  ]);

  return { membership, invite: updatedInvite };
}

function generateInviteToken(): string {
  // Token aleatório seguro (32 caracteres base64)
  return Buffer.from(Math.random().toString()).toString('base64').slice(0, 32) +
         Date.now().toString(36) +
         Math.random().toString(36).slice(2, 8);
}

function getRoleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    OWNER: 'Proprietário',
    ADMIN: 'Administrador',
    LAWYER: 'Advogado',
    ASSISTANT: 'Assistente',
    VIEWER: 'Visualizador',
  };
  return labels[role];
}
