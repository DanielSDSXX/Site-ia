import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { isDemoAI } from '@/lib/env';
import { usageSummary } from '@/lib/ai/usage';
import { indexStats } from '@/lib/rag/vector-store';
import { PageBody, PageHeader } from '@/components/page-header';
import { Card, CardHeader, DemoNotice, EmptyState, SeverityBadge } from '@/components/ui';
import { formatUsd, relativeTime } from '@/lib/utils';
import { IconAlert, IconBrain, IconChevronRight, IconSwords, IconTarget } from '@/components/icons';
import { ANALYSIS_LABELS } from '@/lib/intelligence/analysis';
import type { AnalysisType } from '@prisma/client';

export const metadata: Metadata = { title: 'Inteligência' };
export const dynamic = 'force-dynamic';

const FINDING_GROUPS = [
  {
    types: ['VULNERABILITY', 'EVIDENCE_GAP'],
    title: 'Vulnerabilidades e lacunas de prova',
    description: 'Onde os processos do escritório estão mais expostos.',
    icon: IconAlert,
    color: 'var(--risk-critical)',
  },
  {
    types: ['CONTRADICTION'],
    title: 'Contradições',
    description: 'Divergências de data, valor ou versão entre peças.',
    icon: IconBrain,
    color: 'var(--risk-medium)',
  },
  {
    types: ['ADVERSARIAL_ARGUMENT'],
    title: 'Argumentos do adversário',
    description: 'O que a parte contrária tende a sustentar.',
    icon: IconSwords,
    color: 'var(--risk-high)',
  },
  {
    types: ['STRATEGIC_ACTION'],
    title: 'Ações sugeridas',
    description: 'Providências que aguardam decisão.',
    icon: IconTarget,
    color: 'var(--accent)',
  },
] as const;

export default async function IntelligencePage() {
  const ctx = await requirePermission('analysis:read');
  const organizationId = ctx.organization.id;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [findings, recentAnalyses, byType, usage, index] = await Promise.all([
    prisma.finding.findMany({
      where: { organizationId, status: 'OPEN' },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 60,
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        severity: true,
        createdAt: true,
        processId: true,
        process: { select: { number: true } },
      },
    }),
    prisma.aIAnalysis.findMany({
      where: { organizationId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 12,
      select: {
        id: true,
        type: true,
        confidence: true,
        summary: true,
        completedAt: true,
        provider: true,
        model: true,
        processId: true,
        process: { select: { number: true } },
      },
    }),
    prisma.aIAnalysis.groupBy({
      by: ['type'],
      where: { organizationId, status: 'COMPLETED' },
      _count: true,
    }),
    usageSummary({ organizationId, since: startOfMonth }),
    indexStats(organizationId),
  ]);

  return (
    <PageBody>
      <PageHeader
        title="Central de inteligência"
        description="Tudo o que as análises encontraram nos processos do escritório, reunido num lugar só."
      />

      {isDemoAI() && (
        <div className="mt-5">
          <DemoNotice />
        </div>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Achados em aberto"
          value={String(findings.length)}
          hint="Vulnerabilidades, contradições e ações"
        />
        <MetricCard
          label="Análises concluídas"
          value={String(byType.reduce((sum, item) => sum + item._count, 0))}
          hint="Desde o início do escritório"
        />
        <MetricCard
          label="Trechos indexados"
          value={`${index.embedded}/${index.total}`}
          hint={`Busca vetorial: ${index.driver}`}
        />
        <MetricCard
          label="Custo de IA no mês"
          value={formatUsd(usage.totalCostUsd)}
          hint={`${usage.totalCalls} chamada(s)`}
        />
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {FINDING_GROUPS.map((group) => {
            const items = findings.filter((finding) => group.types.includes(finding.type as never));
            return (
              <Card key={group.title} className="overflow-hidden">
                <CardHeader
                  title={group.title}
                  description={group.description}
                  icon={<group.icon className="size-4.5" style={{ color: group.color }} />}
                  action={
                    <span className="text-[12.5px] text-[var(--text-subtle)]">{items.length}</span>
                  }
                />
                {items.length === 0 ? (
                  <EmptyState title="Nada registrado nesta categoria" />
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {items.slice(0, 8).map((finding) => (
                      <li key={finding.id}>
                        <Link
                          href={`/processos/${finding.processId}?aba=${
                            finding.type === 'STRATEGIC_ACTION' ? 'estrategia' : 'riscos'
                          }`}
                          className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--bg-subtle)]"
                        >
                          <SeverityBadge severity={finding.severity} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium">{finding.title}</p>
                            <p className="mt-0.5 line-clamp-1 text-[12.5px] text-[var(--text-muted)]">
                              {finding.description}
                            </p>
                            <p className="mt-1 font-mono text-[11px] text-[var(--text-subtle)]">
                              {finding.process.number} · {relativeTime(finding.createdAt)}
                            </p>
                          </div>
                          <IconChevronRight className="mt-1 size-4 shrink-0 text-[var(--text-subtle)]" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader title="Análises recentes" />
            {recentAnalyses.length === 0 ? (
              <EmptyState title="Nenhuma análise executada" />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recentAnalyses.map((analysis) => (
                  <li key={analysis.id}>
                    <Link
                      href={`/processos/${analysis.processId}`}
                      className="block px-5 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      <p className="text-[13px] font-medium">
                        {ANALYSIS_LABELS[analysis.type as AnalysisType] ?? analysis.type}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-[var(--text-subtle)]">
                        {analysis.process.number}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-subtle)]">
                        {relativeTime(analysis.completedAt)}
                        {analysis.provider ? ` · ${analysis.provider}` : ''}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Análises por tipo" />
            <ul className="divide-y divide-[var(--border)]">
              {byType
                .sort((a, b) => b._count - a._count)
                .map((item) => (
                  <li key={item.type} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-[13px]">
                      {ANALYSIS_LABELS[item.type as AnalysisType] ?? item.type}
                    </span>
                    <span className="text-[13px] font-medium text-[var(--text-muted)]">
                      {item._count}
                    </span>
                  </li>
                ))}
              {byType.length === 0 && (
                <li className="px-5 py-6 text-center text-[13px] text-[var(--text-subtle)]">
                  Nenhuma análise ainda.
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </PageBody>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[11.5px] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1.5 text-[24px] font-semibold leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-[11px] text-[var(--text-subtle)]">{hint}</p>
    </Card>
  );
}
