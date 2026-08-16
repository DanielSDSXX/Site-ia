import { AIOperation, CreditReason } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logError } from '@/lib/errors';
import { creditsFor, estimateCostUsd } from './pricing';

/**
 * Contabilidade de IA.
 *
 * Duas visões distintas do mesmo evento:
 *  - AIUsage: telemetria de custo (tokens, dólares) — para a plataforma.
 *  - CreditLedgerEntry: consumo em créditos — para o cliente.
 */

export interface RecordUsageInput {
  organizationId: string;
  userId?: string | null;
  processId?: string | null;
  operation: AIOperation;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  success?: boolean;
  /** Provedores locais não consomem crédito nem geram custo externo. */
  billable?: boolean;
}

export async function recordAIUsage(input: RecordUsageInput) {
  const billable = input.billable ?? input.provider !== 'local';
  const estimatedCostUsd = billable
    ? estimateCostUsd(input.model, input.inputTokens, input.outputTokens)
    : 0;
  const creditsCharged = billable ? creditsFor(input.operation) : 0;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.aIUsage.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId ?? null,
          processId: input.processId ?? null,
          operation: input.operation,
          provider: input.provider,
          model: input.model,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          estimatedCostUsd,
          creditsCharged,
          durationMs: input.durationMs,
          success: input.success ?? true,
        },
      });

      if (creditsCharged > 0) {
        const last = await tx.creditLedgerEntry.findFirst({
          where: { organizationId: input.organizationId },
          orderBy: { createdAt: 'desc' },
          select: { balanceAfter: true },
        });
        const balanceAfter = (last?.balanceAfter ?? 0) - creditsCharged;
        await tx.creditLedgerEntry.create({
          data: {
            organizationId: input.organizationId,
            amount: -creditsCharged,
            balanceAfter,
            reason: CreditReason.CONSUMPTION,
            operation: input.operation,
            reference: input.processId ?? null,
          },
        });
      }
    });
  } catch (err) {
    // Telemetria nunca deve derrubar a operação que a originou.
    logError('ai.usage', err, { organizationId: input.organizationId, operation: input.operation });
  }
}

export async function creditBalance(organizationId: string): Promise<number> {
  const last = await prisma.creditLedgerEntry.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfter: true },
  });
  return last?.balanceAfter ?? 0;
}

export async function grantCredits(
  organizationId: string,
  amount: number,
  reason: CreditReason,
  reference?: string,
) {
  const balance = await creditBalance(organizationId);
  return prisma.creditLedgerEntry.create({
    data: {
      organizationId,
      amount,
      balanceAfter: balance + amount,
      reason,
      reference: reference ?? null,
    },
  });
}

export interface UsageSummary {
  totalCostUsd: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  byOperation: { operation: string; calls: number; costUsd: number }[];
}

export async function usageSummary(
  where: { organizationId?: string; since?: Date; until?: Date },
): Promise<UsageSummary> {
  const filter = {
    ...(where.organizationId ? { organizationId: where.organizationId } : {}),
    ...(where.since || where.until
      ? { createdAt: { ...(where.since ? { gte: where.since } : {}), ...(where.until ? { lte: where.until } : {}) } }
      : {}),
  };

  const [totals, grouped] = await Promise.all([
    prisma.aIUsage.aggregate({
      where: filter,
      _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    }),
    prisma.aIUsage.groupBy({
      by: ['operation'],
      where: filter,
      _sum: { estimatedCostUsd: true },
      _count: true,
    }),
  ]);

  return {
    totalCostUsd: totals._sum.estimatedCostUsd ?? 0,
    totalCalls: totals._count,
    inputTokens: totals._sum.inputTokens ?? 0,
    outputTokens: totals._sum.outputTokens ?? 0,
    byOperation: grouped
      .map((g) => ({
        operation: g.operation,
        calls: g._count,
        costUsd: g._sum.estimatedCostUsd ?? 0,
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
  };
}
