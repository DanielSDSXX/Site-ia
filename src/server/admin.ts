import { prisma } from '@/lib/db';
import { usageSummary } from '@/lib/ai/usage';

/**
 * Painel administrativo da plataforma (não do escritório).
 *
 * Só é acessível a usuários com `isPlatformAdmin`. As consultas aqui cruzam
 * organizações de propósito — é a única parte do sistema que faz isso.
 */

export async function platformOverview() {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30 = new Date(now.getTime() - 30 * 86_400_000);

  const [
    organizations,
    users,
    activeUsers30d,
    processes,
    documents,
    analyses,
    failedJobs,
    todayUsage,
    monthUsage,
    subscriptions,
    topOrganizations,
  ] = await Promise.all([
    prisma.organization.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, lastLoginAt: { gte: last30 } } }),
    prisma.process.count({ where: { deletedAt: null } }),
    prisma.document.count({ where: { deletedAt: null } }),
    prisma.aIAnalysis.count({ where: { status: 'COMPLETED' } }),
    prisma.job.count({ where: { status: 'FAILED' } }),
    usageSummary({ since: startOfDay }),
    usageSummary({ since: startOfMonth }),
    prisma.subscription.groupBy({ by: ['status'], _count: true }),
    prisma.aIUsage.groupBy({
      by: ['organizationId'],
      where: { createdAt: { gte: startOfMonth } },
      _sum: { estimatedCostUsd: true },
      _count: true,
      orderBy: { _sum: { estimatedCostUsd: 'desc' } },
      take: 10,
    }),
  ]);

  const orgNames = await prisma.organization.findMany({
    where: { id: { in: topOrganizations.map((o) => o.organizationId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(orgNames.map((o) => [o.id, o.name]));

  // Receita recorrente mensal a partir dos planos das assinaturas ativas.
  const activeSubscriptions = await prisma.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'TRIALING'] } },
    select: { status: true, plan: { select: { monthlyPriceCents: true, name: true } } },
  });
  const mrrCents = activeSubscriptions
    .filter((s) => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.plan.monthlyPriceCents, 0);

  return {
    counts: { organizations, users, activeUsers30d, processes, documents, analyses, failedJobs },
    usage: { today: todayUsage, month: monthUsage },
    subscriptions: subscriptions.map((s) => ({ status: s.status, count: s._count })),
    mrrCents,
    topOrganizations: topOrganizations.map((o) => ({
      organizationId: o.organizationId,
      name: nameById.get(o.organizationId) ?? o.organizationId,
      costUsd: o._sum.estimatedCostUsd ?? 0,
      calls: o._count,
    })),
  };
}

export async function listOrganizations(limit = 50) {
  return prisma.organization.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      subscription: { select: { status: true, plan: { select: { name: true, tier: true } } } },
      _count: { select: { memberships: true, processes: true, documents: true } },
    },
  });
}

export async function recentErrors(limit = 30) {
  return prisma.job.findMany({
    where: { status: 'FAILED' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      lastError: true,
      attempts: true,
      updatedAt: true,
      organizationId: true,
    },
  });
}

/** Série diária de custo de IA para o gráfico do painel. */
export async function dailyCostSeries(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.$queryRaw<{ day: Date; cost: number; calls: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day,
           SUM("estimatedCostUsd")::float AS cost,
           COUNT(*)::bigint AS calls
    FROM "ai_usage"
    WHERE "createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  return rows.map((row) => ({
    day: row.day.toISOString().slice(0, 10),
    cost: Number(row.cost ?? 0),
    calls: Number(row.calls ?? 0),
  }));
}
