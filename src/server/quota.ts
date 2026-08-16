import { prisma } from '@/lib/db';
import { QuotaExceededError } from '@/lib/errors';
import { creditBalance } from '@/lib/ai/usage';

/**
 * Limites de plano.
 *
 * Cada verificação lê o plano vigente da organização. Quando o limite é -1,
 * o recurso é ilimitado. Planos sem assinatura (estado inesperado) recebem os
 * limites do plano Free por segurança, nunca acesso ilimitado.
 */

const FREE_FALLBACK = {
  maxProcesses: 2,
  maxUsers: 1,
  maxDocumentsMonth: 20,
  maxStorageMb: 200,
  monthlyCredits: 50,
};

export async function planFor(organizationId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  return subscription?.plan ?? FREE_FALLBACK;
}

export async function assertProcessQuota(organizationId: string) {
  const plan = await planFor(organizationId);
  if (plan.maxProcesses < 0) return;

  const count = await prisma.process.count({ where: { organizationId, deletedAt: null } });
  if (count >= plan.maxProcesses) {
    throw new QuotaExceededError(
      `Seu plano permite ${plan.maxProcesses} processo(s). Arquive um processo ou faça upgrade para continuar.`,
    );
  }
}

export async function assertDocumentQuota(organizationId: string) {
  const plan = await planFor(organizationId);
  if (plan.maxDocumentsMonth < 0) return;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const count = await prisma.document.count({
    where: { organizationId, createdAt: { gte: startOfMonth } },
  });
  if (count >= plan.maxDocumentsMonth) {
    throw new QuotaExceededError(
      `Seu plano permite ${plan.maxDocumentsMonth} documento(s) por mês. Faça upgrade para enviar mais.`,
    );
  }
}

export async function assertUserQuota(organizationId: string) {
  const plan = await planFor(organizationId);
  if (plan.maxUsers < 0) return;

  const count = await prisma.membership.count({ where: { organizationId } });
  if (count >= plan.maxUsers) {
    throw new QuotaExceededError(
      `Seu plano permite ${plan.maxUsers} usuário(s). Faça upgrade para adicionar mais pessoas ao escritório.`,
    );
  }
}

/**
 * Créditos de IA. Bloqueamos apenas quando o saldo fica negativo — assim uma
 * análise em andamento nunca é interrompida pela metade por falta de crédito.
 */
export async function assertCreditBalance(organizationId: string) {
  const balance = await creditBalance(organizationId);
  if (balance <= 0) {
    throw new QuotaExceededError(
      'Os créditos de IA do seu plano acabaram neste ciclo. Faça upgrade ou aguarde a renovação.',
    );
  }
}

export async function quotaSnapshot(organizationId: string) {
  const plan = await planFor(organizationId);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [processes, users, documentsThisMonth, storageBytes, credits] = await Promise.all([
    prisma.process.count({ where: { organizationId, deletedAt: null } }),
    prisma.membership.count({ where: { organizationId } }),
    prisma.document.count({ where: { organizationId, createdAt: { gte: startOfMonth } } }),
    prisma.document.aggregate({
      where: { organizationId, deletedAt: null },
      _sum: { sizeBytes: true },
    }),
    creditBalance(organizationId),
  ]);

  return {
    plan,
    usage: {
      processes,
      users,
      documentsThisMonth,
      storageMb: Math.round((storageBytes._sum.sizeBytes ?? 0) / (1024 * 1024)),
      credits,
    },
  };
}
