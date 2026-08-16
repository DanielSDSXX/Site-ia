import { Prisma, RiskLevel } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import type { createProcessSchema, processFiltersSchema, updateProcessSchema } from '@/lib/validation';

/**
 * Consultas e escritas de processos.
 *
 * Todo acesso recebe `organizationId` explicitamente — o isolamento entre
 * escritórios é aplicado na cláusula WHERE de cada consulta, nunca presumido
 * a partir de quem chamou.
 */

export type ProcessFilters = z.infer<typeof processFiltersSchema>;
export type CreateProcessInput = z.infer<typeof createProcessSchema>;
export type UpdateProcessInput = z.infer<typeof updateProcessSchema>;

const RISK_ORDER: Record<RiskLevel, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0,
};

export async function listProcesses(organizationId: string, filters: ProcessFilters) {
  const where: Prisma.ProcessWhereInput = {
    organizationId,
    deletedAt: null,
    ...(filters.status && filters.status !== 'ALL' ? { status: filters.status } : {}),
    ...(filters.risk ? { riskLevel: filters.risk } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.responsibleId ? { responsibleId: filters.responsibleId } : {}),
    ...(filters.q
      ? {
          OR: [
            { number: { contains: filters.q, mode: 'insensitive' } },
            { subject: { contains: filters.q, mode: 'insensitive' } },
            { client: { name: { contains: filters.q, mode: 'insensitive' } } },
            { parties: { some: { name: { contains: filters.q, mode: 'insensitive' } } } },
            { responsible: { name: { contains: filters.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(filters.deadlineSoon
      ? {
          deadlines: {
            some: { status: 'OPEN', dueDate: { lte: new Date(Date.now() + 7 * 86_400_000) } },
          },
        }
      : {}),
    ...(filters.noMovement
      ? {
          OR: [
            { lastMovementAt: null },
            { lastMovementAt: { lt: new Date(Date.now() - 90 * 86_400_000) } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ProcessOrderByWithRelationInput[] =
    filters.sort === 'number'
      ? [{ number: 'asc' }]
      : filters.sort === 'risk'
        ? [{ riskScore: 'desc' }, { updatedAt: 'desc' }]
        : [{ updatedAt: 'desc' }];

  const [total, rows] = await Promise.all([
    prisma.process.count({ where }),
    prisma.process.findMany({
      where,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        client: { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true } },
        parties: { where: { side: 'OPPOSING' }, take: 1, select: { name: true } },
        deadlines: {
          where: { status: 'OPEN' },
          orderBy: { dueDate: 'asc' },
          take: 1,
          select: { id: true, title: true, dueDate: true },
        },
        _count: { select: { documents: true, findings: true } },
      },
    }),
  ]);

  const items = rows.map((row) => ({
    id: row.id,
    number: row.number,
    court: row.court,
    courtUnit: row.courtUnit,
    procedureClass: row.procedureClass,
    subject: row.subject,
    status: row.status,
    riskLevel: row.riskLevel,
    riskScore: row.riskScore,
    clientName: row.client?.name ?? null,
    responsibleName: row.responsible?.name ?? null,
    opposingName: row.parties[0]?.name ?? null,
    nextDeadline: row.deadlines[0] ?? null,
    lastMovementAt: row.lastMovementAt,
    lastAnalyzedAt: row.lastAnalyzedAt,
    documentCount: row._count.documents,
    findingCount: row._count.findings,
    isDemo: row.isDemo,
  }));

  if (filters.sort === 'deadline') {
    items.sort((a, b) => {
      const av = a.nextDeadline?.dueDate.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bv = b.nextDeadline?.dueDate.getTime() ?? Number.MAX_SAFE_INTEGER;
      return av - bv;
    });
  }

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

export async function getProcessDetail(organizationId: string, processId: string) {
  const process = await prisma.process.findFirst({
    where: { id: processId, organizationId, deletedAt: null },
    include: {
      client: true,
      responsible: { select: { id: true, name: true, email: true, avatarColor: true } },
      parties: { orderBy: { createdAt: 'asc' } },
      documents: {
        where: { deletedAt: null },
        orderBy: [{ documentDate: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          kind: true,
          status: true,
          pageCount: true,
          sizeBytes: true,
          mimeType: true,
          documentDate: true,
          createdAt: true,
          processingError: true,
          metadata: true,
        },
      },
      deadlines: { orderBy: { dueDate: 'asc' } },
      tasks: { orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] },
      timeline: { orderBy: { occurredAt: 'asc' } },
      claims: { orderBy: { createdAt: 'asc' } },
      legalIssues: { orderBy: { createdAt: 'asc' } },
      evidence: true,
      _count: { select: { chatThreads: true } },
    },
  });

  if (!process) throw new NotFoundError('Processo não encontrado.');
  return process;
}

export async function getProcessFindings(organizationId: string, processId: string) {
  return prisma.finding.findMany({
    where: { organizationId, processId },
    orderBy: [{ createdAt: 'desc' }, { position: 'asc' }],
    include: {
      citations: {
        select: {
          id: true,
          documentId: true,
          pageNumber: true,
          quote: true,
          document: { select: { title: true } },
        },
      },
      analysis: { select: { id: true, type: true, createdAt: true, provider: true, model: true } },
    },
  });
}

export async function getLatestAnalyses(organizationId: string, processId: string) {
  const analyses = await prisma.aIAnalysis.findMany({
    where: { organizationId, processId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    take: 40,
    select: {
      id: true,
      type: true,
      confidence: true,
      summary: true,
      result: true,
      provider: true,
      model: true,
      completedAt: true,
      durationMs: true,
    },
  });

  // Mantém apenas a mais recente de cada tipo.
  const latest = new Map<string, (typeof analyses)[number]>();
  for (const analysis of analyses) {
    if (!latest.has(analysis.type)) latest.set(analysis.type, analysis);
  }
  return latest;
}

export async function createProcess(
  organizationId: string,
  userId: string,
  input: CreateProcessInput,
) {
  const existing = await prisma.process.findFirst({
    where: { organizationId, number: input.number, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw new NotFoundError('Já existe um processo com este número neste escritório.');
  }

  return prisma.process.create({
    data: {
      organizationId,
      createdById: userId,
      number: input.number,
      court: input.court ?? null,
      district: input.district ?? null,
      courtUnit: input.courtUnit ?? null,
      procedureClass: input.procedureClass ?? null,
      subject: input.subject ?? null,
      clientId: input.clientId ?? null,
      responsibleId: input.responsibleId ?? userId,
      caseValueCents: input.caseValueCents ? BigInt(input.caseValueCents) : null,
      notes: input.notes ?? null,
      parties: {
        create: input.parties.map((party) => ({
          organizationId,
          name: party.name,
          role: party.role,
          side: party.side,
          documentId: party.documentId ?? null,
          lawyerName: party.lawyerName ?? null,
          oabNumber: party.oabNumber ?? null,
        })),
      },
    },
    include: { parties: true },
  });
}

export async function updateProcess(
  organizationId: string,
  processId: string,
  input: UpdateProcessInput,
) {
  const process = await prisma.process.findFirst({
    where: { id: processId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!process) throw new NotFoundError('Processo não encontrado.');

  const { parties, caseValueCents, ...rest } = input;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.process.update({
      where: { id: processId },
      data: {
        ...rest,
        ...(caseValueCents !== undefined
          ? { caseValueCents: caseValueCents === null ? null : BigInt(caseValueCents) }
          : {}),
      },
    });

    if (parties) {
      await tx.party.deleteMany({ where: { processId } });
      if (parties.length > 0) {
        await tx.party.createMany({
          data: parties.map((party) => ({
            organizationId,
            processId,
            name: party.name,
            role: party.role,
            side: party.side,
            documentId: party.documentId ?? null,
            lawyerName: party.lawyerName ?? null,
            oabNumber: party.oabNumber ?? null,
          })),
        });
      }
    }

    return updated;
  });
}

/** Exclusão lógica: preserva trilha de auditoria e permite recuperação. */
export async function softDeleteProcess(organizationId: string, processId: string) {
  const process = await prisma.process.findFirst({
    where: { id: processId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!process) throw new NotFoundError('Processo não encontrado.');

  await prisma.process.update({
    where: { id: processId },
    data: { deletedAt: new Date(), status: 'ARCHIVED' },
  });
}

export function riskWeight(level: RiskLevel): number {
  return RISK_ORDER[level];
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  UNKNOWN: 'Não avaliado',
  LOW: 'Baixo',
  MEDIUM: 'Médio',
  HIGH: 'Alto',
  CRITICAL: 'Crítico',
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  ARCHIVED: 'Arquivado',
  CLOSED: 'Encerrado',
};
