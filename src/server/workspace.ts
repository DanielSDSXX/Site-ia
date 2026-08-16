import { DeadlineStatus, Prisma, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { computeDeadline } from '@/lib/deadlines/calculator';
import type { clientSchema, deadlineSchema, taskSchema, updateDeadlineSchema, updateTaskSchema } from '@/lib/validation';

/** Clientes, tarefas, prazos e notificações — o operacional do escritório. */

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export type ClientInput = z.infer<typeof clientSchema>;

export async function listClients(organizationId: string, q?: string) {
  return prisma.client.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    },
    orderBy: { name: 'asc' },
    include: { _count: { select: { processes: true } } },
  });
}

export async function getClient(organizationId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId, deletedAt: null },
    include: {
      processes: {
        where: { deletedAt: null },
        select: { id: true, number: true, subject: true, status: true, riskLevel: true },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });
  if (!client) throw new NotFoundError('Cliente não encontrado.');
  return client;
}

export async function createClient(organizationId: string, input: ClientInput) {
  return prisma.client.create({
    data: {
      organizationId,
      name: input.name,
      type: input.type,
      email: input.email || null,
      phone: input.phone || null,
      notes: input.notes || null,
    },
  });
}

export async function updateClient(organizationId: string, clientId: string, input: Partial<ClientInput>) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!client) throw new NotFoundError('Cliente não encontrado.');
  return prisma.client.update({
    where: { id: clientId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    },
  });
}

export async function deleteClient(organizationId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!client) throw new NotFoundError('Cliente não encontrado.');
  await prisma.client.update({ where: { id: clientId }, data: { deletedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Tarefas
// ---------------------------------------------------------------------------

export type TaskInput = z.infer<typeof taskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export async function listTasks(
  organizationId: string,
  filters: { status?: TaskStatus; assigneeId?: string; processId?: string } = {},
) {
  return prisma.task.findMany({
    where: {
      organizationId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.processId ? { processId: filters.processId } : {}),
    },
    orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueDate: 'asc' }],
    include: {
      assignee: { select: { id: true, name: true, avatarColor: true } },
      process: { select: { id: true, number: true } },
    },
  });
}

export async function createTask(organizationId: string, userId: string, input: TaskInput) {
  return prisma.task.create({
    data: {
      organizationId,
      createdById: userId,
      title: input.title,
      description: input.description ?? null,
      processId: input.processId ?? null,
      assigneeId: input.assigneeId ?? null,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
    },
  });
}

export async function updateTask(organizationId: string, taskId: string, input: UpdateTaskInput) {
  const task = await prisma.task.findFirst({ where: { id: taskId, organizationId }, select: { id: true } });
  if (!task) throw new NotFoundError('Tarefa não encontrada.');

  return prisma.task.update({
    where: { id: taskId },
    data: {
      ...input,
      description: input.description === undefined ? undefined : input.description || null,
      processId: input.processId === undefined ? undefined : input.processId || null,
      assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId || null,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate,
      completedAt: input.status === 'DONE' ? new Date() : input.status ? null : undefined,
    },
  });
}

export async function deleteTask(organizationId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, organizationId }, select: { id: true } });
  if (!task) throw new NotFoundError('Tarefa não encontrada.');
  await prisma.task.delete({ where: { id: taskId } });
}

/** Converte um achado da IA em tarefa — a ponte entre análise e execução. */
export async function taskFromFinding(organizationId: string, userId: string, findingId: string) {
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, organizationId },
    select: { id: true, title: true, description: true, suggestion: true, severity: true, processId: true },
  });
  if (!finding) throw new NotFoundError('Achado não encontrado.');

  return prisma.task.create({
    data: {
      organizationId,
      createdById: userId,
      processId: finding.processId,
      originFindingId: finding.id,
      title: finding.title.slice(0, 200),
      description: [finding.description, finding.suggestion].filter(Boolean).join('\n\n'),
      priority: finding.severity === 'HIGH' ? 'HIGH' : finding.severity === 'MEDIUM' ? 'MEDIUM' : 'LOW',
    },
  });
}

// ---------------------------------------------------------------------------
// Prazos
// ---------------------------------------------------------------------------

export type DeadlineInput = z.infer<typeof deadlineSchema>;
export type UpdateDeadlineInput = z.infer<typeof updateDeadlineSchema>;

export async function listDeadlines(
  organizationId: string,
  filters: { status?: DeadlineStatus; from?: Date; to?: Date; processId?: string } = {},
) {
  return prisma.deadline.findMany({
    where: {
      organizationId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.processId ? { processId: filters.processId } : {}),
      ...(filters.from || filters.to
        ? { dueDate: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    },
    orderBy: { dueDate: 'asc' },
    include: {
      responsible: { select: { id: true, name: true, avatarColor: true } },
      process: { select: { id: true, number: true } },
    },
  });
}

export async function createDeadline(organizationId: string, input: DeadlineInput) {
  let dueDate = input.dueDate ?? null;
  let computed = false;
  let computationNote: string | null = null;

  if (!dueDate && input.baseDate && input.days) {
    const result = computeDeadline({
      baseDate: input.baseDate,
      days: input.days,
      countingMode: input.countingMode,
    });
    dueDate = result.dueDate;
    computed = true;
    computationNote = result.note;
  }

  if (!dueDate) throw new NotFoundError('Não foi possível determinar a data de vencimento.');

  return prisma.deadline.create({
    data: {
      organizationId,
      processId: input.processId ?? null,
      responsibleId: input.responsibleId ?? null,
      title: input.title,
      description: input.description ?? null,
      dueDate,
      baseDate: input.baseDate ?? null,
      days: input.days ?? null,
      countingMode: input.countingMode,
      legalBasis: input.legalBasis ?? null,
      priority: input.priority,
      computed,
      computationNote,
    },
  });
}

export async function updateDeadline(
  organizationId: string,
  deadlineId: string,
  input: UpdateDeadlineInput,
) {
  const deadline = await prisma.deadline.findFirst({
    where: { id: deadlineId, organizationId },
    select: { id: true },
  });
  if (!deadline) throw new NotFoundError('Prazo não encontrado.');

  return prisma.deadline.update({
    where: { id: deadlineId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.dueDate ? { dueDate: input.dueDate, computed: false } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.responsibleId !== undefined ? { responsibleId: input.responsibleId || null } : {}),
    },
  });
}

/**
 * Marca como perdidos os prazos vencidos que continuam abertos.
 * Roda sob demanda ao abrir a agenda — sem cron dedicado.
 */
export async function reconcileOverdueDeadlines(organizationId: string) {
  const { count } = await prisma.deadline.updateMany({
    where: {
      organizationId,
      status: DeadlineStatus.OPEN,
      dueDate: { lt: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
    data: { status: DeadlineStatus.MISSED },
  });
  return count;
}

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------

export async function listNotifications(userId: string, onlyUnread = false, limit = 30) {
  return prisma.notification.findMany({
    where: { userId, ...(onlyUnread ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function unreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const where: Prisma.NotificationWhereInput = { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) };
  const { count } = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return count;
}

/**
 * Cria notificações de prazo próximo (7, 3, 1 e 0 dias), evitando duplicar
 * o mesmo alerta para o mesmo prazo no mesmo dia.
 */
export async function generateDeadlineNotifications(organizationId: string) {
  const thresholds = [7, 3, 1, 0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let created = 0;

  for (const days of thresholds) {
    const target = new Date(today.getTime() + days * 86_400_000);
    const nextDay = new Date(target.getTime() + 86_400_000);

    const deadlines = await prisma.deadline.findMany({
      where: {
        organizationId,
        status: DeadlineStatus.OPEN,
        dueDate: { gte: target, lt: nextDay },
      },
      include: { process: { select: { id: true, number: true } } },
    });

    for (const deadline of deadlines) {
      const recipients = deadline.responsibleId
        ? [deadline.responsibleId]
        : (
            await prisma.membership.findMany({
              where: { organizationId, role: { in: ['OWNER', 'ADMIN', 'LAWYER'] } },
              select: { userId: true },
            })
          ).map((m) => m.userId);

      for (const userId of recipients) {
        const exists = await prisma.notification.findFirst({
          where: {
            userId,
            kind: 'DEADLINE_APPROACHING',
            href: `/prazos?id=${deadline.id}`,
            createdAt: { gte: today },
          },
          select: { id: true },
        });
        if (exists) continue;

        await prisma.notification.create({
          data: {
            organizationId,
            userId,
            processId: deadline.processId,
            kind: 'DEADLINE_APPROACHING',
            title:
              days === 0
                ? `Prazo vence hoje: ${deadline.title}`
                : `Prazo em ${days} dia(s): ${deadline.title}`,
            body: deadline.process ? `Processo ${deadline.process.number}` : null,
            href: `/prazos?id=${deadline.id}`,
          },
        });
        created++;
      }
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------

export async function listMembers(organizationId: string) {
  return prisma.membership.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
    include: {
      user: {
        select: { id: true, name: true, email: true, avatarColor: true, lastLoginAt: true },
      },
    },
  });
}

export async function changeMemberRole(
  organizationId: string,
  membershipId: string,
  role: 'OWNER' | 'ADMIN' | 'LAWYER' | 'ASSISTANT' | 'VIEWER',
) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId },
  });
  if (!membership) throw new NotFoundError('Membro não encontrado.');

  // Uma organização precisa manter ao menos um OWNER.
  if (membership.role === 'OWNER' && role !== 'OWNER') {
    const owners = await prisma.membership.count({ where: { organizationId, role: 'OWNER' } });
    if (owners <= 1) {
      throw new NotFoundError('O escritório precisa ter ao menos um proprietário.');
    }
  }

  return prisma.membership.update({ where: { id: membershipId }, data: { role } });
}

export async function removeMember(organizationId: string, membershipId: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId },
  });
  if (!membership) throw new NotFoundError('Membro não encontrado.');
  if (membership.role === 'OWNER') {
    const owners = await prisma.membership.count({ where: { organizationId, role: 'OWNER' } });
    if (owners <= 1) throw new NotFoundError('O escritório precisa ter ao menos um proprietário.');
  }
  await prisma.membership.delete({ where: { id: membershipId } });
}
