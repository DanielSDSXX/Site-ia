import { prisma } from '@/lib/db';

/**
 * Dados do painel inicial.
 *
 * O bloco "o que precisa da sua atenção" é o produto real desta tela: em vez
 * de métricas decorativas, ele lista o que exige ação e leva direto ao item.
 */

export interface AttentionItem {
  kind: 'risk' | 'deadline' | 'movement' | 'document' | 'finding';
  tone: 'critical' | 'warning' | 'info' | 'neutral';
  count: number;
  label: string;
  href: string;
}

export interface DashboardData {
  stats: {
    activeProcesses: number;
    criticalProcesses: number;
    upcomingDeadlines: number;
    pendingTasks: number;
    recentMovements: number;
    analysesRun: number;
  };
  attention: AttentionItem[];
  urgentDeadlines: {
    id: string;
    title: string;
    dueDate: Date;
    processId: string | null;
    processNumber: string | null;
    priority: string;
  }[];
  riskyProcesses: {
    id: string;
    number: string;
    subject: string | null;
    riskLevel: string;
    riskScore: number | null;
    clientName: string | null;
    openFindings: number;
  }[];
  recentFindings: {
    id: string;
    title: string;
    type: string;
    severity: string;
    processId: string;
    processNumber: string;
    createdAt: Date;
  }[];
  processingDocuments: number;
}

export async function loadDashboard(organizationId: string): Promise<DashboardData> {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 86_400_000);
  const last7Days = new Date(now.getTime() - 7 * 86_400_000);
  const last30Days = new Date(now.getTime() - 30 * 86_400_000);

  const [
    activeProcesses,
    criticalProcesses,
    upcomingDeadlines,
    pendingTasks,
    recentMovements,
    analysesRun,
    processingDocuments,
    urgentDeadlinesRaw,
    riskyProcessesRaw,
    recentFindingsRaw,
    unreadDocuments,
  ] = await Promise.all([
    prisma.process.count({ where: { organizationId, deletedAt: null, status: 'ACTIVE' } }),
    prisma.process.count({
      where: { organizationId, deletedAt: null, status: 'ACTIVE', riskLevel: { in: ['HIGH', 'CRITICAL'] } },
    }),
    prisma.deadline.count({
      where: { organizationId, status: 'OPEN', dueDate: { lte: in7Days } },
    }),
    prisma.task.count({
      where: { organizationId, status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] } },
    }),
    prisma.timelineEvent.count({
      where: { organizationId, occurredAt: { gte: last7Days } },
    }),
    prisma.aIAnalysis.count({
      where: { organizationId, status: 'COMPLETED', completedAt: { gte: last30Days } },
    }),
    prisma.document.count({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ['PENDING', 'EXTRACTING', 'NEEDS_OCR', 'CHUNKING', 'EMBEDDING'] },
      },
    }),
    prisma.deadline.findMany({
      where: { organizationId, status: 'OPEN', dueDate: { lte: in7Days } },
      orderBy: { dueDate: 'asc' },
      take: 6,
      select: {
        id: true,
        title: true,
        dueDate: true,
        priority: true,
        processId: true,
        process: { select: { number: true } },
      },
    }),
    prisma.process.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        riskLevel: { in: ['HIGH', 'CRITICAL'] },
      },
      orderBy: [{ riskScore: 'desc' }],
      take: 6,
      select: {
        id: true,
        number: true,
        subject: true,
        riskLevel: true,
        riskScore: true,
        client: { select: { name: true } },
        _count: { select: { findings: true } },
      },
    }),
    prisma.finding.findMany({
      where: { organizationId, status: 'OPEN', severity: { in: ['HIGH', 'MEDIUM'] } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        title: true,
        type: true,
        severity: true,
        createdAt: true,
        processId: true,
        process: { select: { number: true } },
      },
    }),
    prisma.document.count({
      where: { organizationId, deletedAt: null, status: 'INDEXED', process: { lastAnalyzedAt: null } },
    }),
  ]);

  const attention: AttentionItem[] = [];

  if (criticalProcesses > 0) {
    attention.push({
      kind: 'risk',
      tone: 'critical',
      count: criticalProcesses,
      label: `${criticalProcesses} processo(s) com risco elevado`,
      href: '/processos?risk=HIGH',
    });
  }
  if (upcomingDeadlines > 0) {
    attention.push({
      kind: 'deadline',
      tone: 'warning',
      count: upcomingDeadlines,
      label: `${upcomingDeadlines} prazo(s) nos próximos 7 dias`,
      href: '/prazos',
    });
  }
  if (recentMovements > 0) {
    attention.push({
      kind: 'movement',
      tone: 'info',
      count: recentMovements,
      label: `${recentMovements} movimentação(ões) identificada(s) na última semana`,
      href: '/processos?sort=recent',
    });
  }
  if (unreadDocuments > 0) {
    attention.push({
      kind: 'document',
      tone: 'neutral',
      count: unreadDocuments,
      label: `${unreadDocuments} documento(s) indexado(s) aguardando análise`,
      href: '/documentos',
    });
  }
  if (processingDocuments > 0) {
    attention.push({
      kind: 'document',
      tone: 'neutral',
      count: processingDocuments,
      label: `${processingDocuments} documento(s) em processamento`,
      href: '/documentos',
    });
  }

  return {
    stats: {
      activeProcesses,
      criticalProcesses,
      upcomingDeadlines,
      pendingTasks,
      recentMovements,
      analysesRun,
    },
    attention,
    urgentDeadlines: urgentDeadlinesRaw.map((d) => ({
      id: d.id,
      title: d.title,
      dueDate: d.dueDate,
      priority: d.priority,
      processId: d.processId,
      processNumber: d.process?.number ?? null,
    })),
    riskyProcesses: riskyProcessesRaw.map((p) => ({
      id: p.id,
      number: p.number,
      subject: p.subject,
      riskLevel: p.riskLevel,
      riskScore: p.riskScore,
      clientName: p.client?.name ?? null,
      openFindings: p._count.findings,
    })),
    recentFindings: recentFindingsRaw.map((f) => ({
      id: f.id,
      title: f.title,
      type: f.type,
      severity: f.severity,
      processId: f.processId,
      processNumber: f.process.number,
      createdAt: f.createdAt,
    })),
    processingDocuments,
  };
}

// ---------------------------------------------------------------------------
// Busca global (Ctrl+K)
// ---------------------------------------------------------------------------

export interface SearchResult {
  type: 'process' | 'client' | 'document' | 'task' | 'jurisprudence';
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export async function globalSearch(
  organizationId: string,
  query: string,
  limit = 8,
): Promise<SearchResult[]> {
  const contains = { contains: query, mode: 'insensitive' as const };

  const [processes, clients, documents, tasks, jurisprudence] = await Promise.all([
    prisma.process.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { number: contains },
          { subject: contains },
          { parties: { some: { name: contains } } },
          { client: { name: contains } },
        ],
      },
      take: limit,
      select: { id: true, number: true, subject: true, client: { select: { name: true } } },
    }),
    prisma.client.findMany({
      where: { organizationId, deletedAt: null, name: contains },
      take: Math.ceil(limit / 2),
      select: { id: true, name: true, type: true },
    }),
    prisma.document.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ title: contains }, { originalFilename: contains }],
      },
      take: limit,
      select: { id: true, title: true, kind: true, process: { select: { number: true } } },
    }),
    prisma.task.findMany({
      where: { organizationId, title: contains },
      take: Math.ceil(limit / 2),
      select: { id: true, title: true, status: true },
    }),
    prisma.jurisprudence.findMany({
      where: {
        OR: [{ organizationId }, { organizationId: null }],
        AND: [{ OR: [{ summary: contains }, { caseNumber: contains }, { thesis: contains }] }],
      },
      take: Math.ceil(limit / 2),
      select: { id: true, court: true, caseNumber: true, thesis: true },
    }),
  ]);

  return [
    ...processes.map((p) => ({
      type: 'process' as const,
      id: p.id,
      title: p.number,
      subtitle: p.subject ?? p.client?.name ?? null,
      href: `/processos/${p.id}`,
    })),
    ...clients.map((c) => ({
      type: 'client' as const,
      id: c.id,
      title: c.name,
      subtitle: c.type === 'COMPANY' ? 'Pessoa jurídica' : 'Pessoa física',
      href: `/clientes/${c.id}`,
    })),
    ...documents.map((d) => ({
      type: 'document' as const,
      id: d.id,
      title: d.title,
      subtitle: d.process?.number ?? null,
      href: `/documentos/${d.id}`,
    })),
    ...tasks.map((t) => ({
      type: 'task' as const,
      id: t.id,
      title: t.title,
      subtitle: 'Tarefa',
      href: '/tarefas',
    })),
    ...jurisprudence.map((j) => ({
      type: 'jurisprudence' as const,
      id: j.id,
      title: `${j.court} — ${j.caseNumber}`,
      subtitle: j.thesis?.slice(0, 120) ?? null,
      href: `/jurisprudencia?id=${j.id}`,
    })),
  ];
}
