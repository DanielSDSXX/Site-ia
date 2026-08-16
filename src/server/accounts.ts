import { CreditReason, PlanTier, Role, SubscriptionStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword, checkPasswordStrength, verifyPassword } from '@/lib/auth/password';
import { AppError, ValidationError } from '@/lib/errors';
import { slugify } from '@/lib/utils';
import { grantCredits } from '@/lib/ai/usage';
import type { registerSchema } from '@/lib/validation';

/** Cadastro de usuários, escritórios e assinatura inicial. */

export type RegisterInput = z.infer<typeof registerSchema>;

const AVATAR_COLORS = ['#5B67F1', '#0EA5A5', '#D97757', '#7C3AED', '#DB2777', '#0284C7', '#65A30D'];

export async function registerAccount(input: RegisterInput) {
  const strength = checkPasswordStrength(input.password);
  if (!strength.ok) throw new ValidationError(strength.problems.join(' '));

  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    throw new AppError('Já existe uma conta com este e-mail.', {
      status: 409,
      code: 'email_taken',
      expose: true,
    });
  }

  const passwordHash = await hashPassword(input.password);
  const freePlan = await ensureFreePlan();

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      },
    });

    const organization = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug: await uniqueSlug(tx, slugify(input.organizationName) || 'escritorio'),
      },
    });

    await tx.membership.create({
      data: { userId: user.id, organizationId: organization.id, role: Role.OWNER },
    });

    await tx.subscription.create({
      data: {
        organizationId: organization.id,
        planId: freePlan.id,
        status: SubscriptionStatus.TRIALING,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    return { user, organization };
  });

  await grantCredits(
    result.organization.id,
    freePlan.monthlyCredits,
    CreditReason.SUBSCRIPTION_GRANT,
    'registro',
  );

  return result;
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function uniqueSlug(tx: TxClient, base: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  while (await tx.organization.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${++suffix}`;
  }
  return candidate;
}

/** Planos base. Idempotente — pode rodar em todo boot ou no seed. */
export async function ensurePlans() {
  const definitions = [
    {
      tier: PlanTier.FREE,
      name: 'Free',
      description: 'Para experimentar a plataforma com um processo real.',
      monthlyPriceCents: 0,
      maxProcesses: 2,
      maxUsers: 1,
      maxDocumentsMonth: 20,
      monthlyCredits: 50,
      maxStorageMb: 200,
      features: ['1 usuário', '2 processos', 'Análises básicas', 'Chat com citações'],
    },
    {
      tier: PlanTier.PRO,
      name: 'Pro',
      description: 'Para advogados autônomos e pequenos escritórios.',
      monthlyPriceCents: 19900,
      maxProcesses: 50,
      maxUsers: 3,
      maxDocumentsMonth: 500,
      monthlyCredits: 1500,
      maxStorageMb: 5000,
      features: [
        'Até 3 usuários',
        '50 processos',
        'Todas as análises de inteligência',
        'Relatórios em PDF e DOCX',
        'Prazos e tarefas',
      ],
    },
    {
      tier: PlanTier.BUSINESS,
      name: 'Business',
      description: 'Para escritórios com equipe e volume constante.',
      monthlyPriceCents: 59900,
      maxProcesses: 500,
      maxUsers: 15,
      maxDocumentsMonth: 3000,
      monthlyCredits: 8000,
      maxStorageMb: 50_000,
      features: [
        'Até 15 usuários',
        '500 processos',
        'Memória do Escritório',
        'Acervo de jurisprudência próprio',
        'Trilha de auditoria completa',
      ],
    },
    {
      tier: PlanTier.ENTERPRISE,
      name: 'Enterprise',
      description: 'Volume elevado, controle avançado e customizações.',
      monthlyPriceCents: 0,
      maxProcesses: -1,
      maxUsers: -1,
      maxDocumentsMonth: -1,
      monthlyCredits: 40_000,
      maxStorageMb: -1,
      features: [
        'Usuários e processos ilimitados',
        'Provedor de IA dedicado ou self-hosted',
        'SSO e políticas de retenção',
        'Suporte prioritário',
      ],
    },
  ];

  for (const definition of definitions) {
    await prisma.plan.upsert({
      where: { tier: definition.tier },
      update: { ...definition, features: definition.features },
      create: { ...definition, features: definition.features },
    });
  }
}

async function ensureFreePlan() {
  const existing = await prisma.plan.findUnique({ where: { tier: PlanTier.FREE } });
  if (existing) return existing;
  await ensurePlans();
  const plan = await prisma.plan.findUnique({ where: { tier: PlanTier.FREE } });
  if (!plan) throw new Error('Não foi possível criar o plano Free.');
  return plan;
}

// ---------------------------------------------------------------------------
// Conta do usuário
// ---------------------------------------------------------------------------

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new AppError('Usuário não encontrado.', { status: 404, expose: true });

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ValidationError('A senha atual está incorreta.');
  }

  const strength = checkPasswordStrength(newPassword);
  if (!strength.ok) throw new ValidationError(strength.problems.join(' '));

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } }),
    // Invalida as demais sessões após troca de senha.
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

/**
 * Exclusão de conta (LGPD, art. 18, VI).
 *
 * Anonimiza o usuário e revoga as sessões. Se ele for o único proprietário de
 * um escritório, o escritório inteiro é marcado como excluído — não deixamos
 * dados órfãos sem responsável.
 */
export async function deleteAccount(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { organizationId: true, role: true },
  });

  for (const membership of memberships) {
    if (membership.role !== Role.OWNER) continue;
    const owners = await prisma.membership.count({
      where: { organizationId: membership.organizationId, role: Role.OWNER },
    });
    if (owners <= 1) {
      await prisma.organization.update({
        where: { id: membership.organizationId },
        data: { deletedAt: new Date() },
      });
    }
  }

  await prisma.$transaction([
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        name: 'Usuário removido',
        email: `removido+${userId}@legalmind.invalid`,
        passwordHash: 'deleted',
      },
    }),
  ]);
}

export async function exportUserData(userId: string, organizationId: string) {
  const [user, processes, documents, tasks, deadlines, auditLogs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, createdAt: true, lastLoginAt: true },
    }),
    prisma.process.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, number: true, subject: true, status: true, createdAt: true },
    }),
    prisma.document.findMany({
      where: { organizationId, uploadedById: userId, deletedAt: null },
      select: { id: true, title: true, originalFilename: true, sizeBytes: true, createdAt: true },
    }),
    prisma.task.findMany({ where: { organizationId, assigneeId: userId } }),
    prisma.deadline.findMany({ where: { organizationId, responsibleId: userId } }),
    prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { action: true, resourceType: true, createdAt: true },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    processes,
    documents,
    tasks,
    deadlines,
    auditLogs,
  };
}
