import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { loadDashboard } from '@/server/dashboard';
import { PageBody, PageHeader } from '@/components/page-header';
import { Card, CardHeader, EmptyState, LinkButton, RiskBadge, SeverityBadge } from '@/components/ui';
import { daysUntil, formatDate, greeting, relativeTime } from '@/lib/utils';
import {
  IconAlert,
  IconArrowRight,
  IconBrain,
  IconCalendar,
  IconChevronRight,
  IconDocument,
  IconPlus,
  IconProcess,
  IconTarget,
} from '@/components/icons';
import type { AttentionItem } from '@/server/dashboard';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const data = await loadDashboard(ctx.organization.id);
  const firstName = ctx.user.name.split(' ')[0];

  return (
    <PageBody>
      <PageHeader
        title={`${greeting()}, ${firstName}.`}
        description={
          data.attention.length > 0
            ? 'Estes são os pontos do escritório que pedem decisão hoje.'
            : 'Nada exige sua atenção imediata no momento.'
        }
        action={
          ctx.can('process:write') && (
            <LinkButton href="/processos/novo" variant="primary" size="md">
              <IconPlus className="size-4" />
              Novo processo
            </LinkButton>
          )
        }
      />

      {/* ------------------------------------------------- O que precisa de você */}
      <section className="mt-7">
        <Card className="overflow-hidden">
          <CardHeader
            title="O que precisa da sua atenção"
            description="Ordenado por urgência real, não por data de cadastro."
            icon={<IconTarget className="size-4.5" />}
          />
          {data.attention.length === 0 ? (
            <EmptyState
              icon={<IconTarget className="size-5" />}
              title="Nenhum ponto crítico no momento"
              description="Quando surgir um risco elevado, um prazo próximo ou um documento aguardando análise, ele aparece aqui."
            />
          ) : (
            <ul>
              {data.attention.map((item) => (
                <AttentionRow key={`${item.kind}-${item.label}`} item={item} />
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* -------------------------------------------------------------- Números */}
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Processos ativos" value={data.stats.activeProcesses} href="/processos" />
        <Stat
          label="Processos críticos"
          value={data.stats.criticalProcesses}
          href="/processos?risk=HIGH"
          tone={data.stats.criticalProcesses > 0 ? 'critical' : 'neutral'}
        />
        <Stat label="Prazos em 7 dias" value={data.stats.upcomingDeadlines} href="/prazos" tone={data.stats.upcomingDeadlines > 0 ? 'warning' : 'neutral'} />
        <Stat label="Tarefas pendentes" value={data.stats.pendingTasks} href="/tarefas" />
        <Stat label="Movimentações (7d)" value={data.stats.recentMovements} href="/processos" />
        <Stat label="Análises (30d)" value={data.stats.analysesRun} href="/inteligencia" />
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------------ Prazos urgentes */}
        <Card className="overflow-hidden">
          <CardHeader
            title="Prazos mais próximos"
            icon={<IconCalendar className="size-4.5" />}
            action={
              <Link
                href="/prazos"
                className="text-[12.5px] text-[var(--accent)] hover:underline"
              >
                Ver agenda
              </Link>
            }
          />
          {data.urgentDeadlines.length === 0 ? (
            <EmptyState title="Nenhum prazo nos próximos 7 dias" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.urgentDeadlines.map((deadline) => {
                const days = daysUntil(deadline.dueDate);
                return (
                  <li key={deadline.id}>
                    <Link
                      href={deadline.processId ? `/processos/${deadline.processId}?aba=prazos` : '/prazos'}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      <div
                        className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg text-[11px] font-semibold leading-none"
                        style={{
                          background: days <= 1 ? 'var(--risk-critical-bg)' : 'var(--risk-medium-bg)',
                          color: days <= 1 ? 'var(--risk-critical)' : 'var(--risk-medium)',
                        }}
                      >
                        <span className="text-[15px]">{Math.max(days, 0)}</span>
                        <span className="mt-0.5 text-[9px] uppercase">
                          {days === 1 ? 'dia' : 'dias'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{deadline.title}</p>
                        <p className="truncate text-[12px] text-[var(--text-subtle)]">
                          {deadline.processNumber ?? 'Sem processo vinculado'} ·{' '}
                          {formatDate(deadline.dueDate)}
                        </p>
                      </div>
                      <IconChevronRight className="size-4 shrink-0 text-[var(--text-subtle)]" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ------------------------------------------------------ Processos de risco */}
        <Card className="overflow-hidden">
          <CardHeader
            title="Processos com risco elevado"
            icon={<IconAlert className="size-4.5" />}
            action={
              <Link
                href="/processos?risk=HIGH"
                className="text-[12.5px] text-[var(--accent)] hover:underline"
              >
                Ver todos
              </Link>
            }
          />
          {data.riskyProcesses.length === 0 ? (
            <EmptyState
              title="Nenhum processo classificado como risco alto"
              description="A classificação de risco é preenchida pela análise do processo."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.riskyProcesses.map((process) => (
                <li key={process.id}>
                  <Link
                    href={`/processos/${process.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[12.5px] font-medium">{process.number}</p>
                      <p className="truncate text-[12px] text-[var(--text-subtle)]">
                        {process.subject ?? 'Sem assunto'}
                        {process.clientName ? ` · ${process.clientName}` : ''}
                      </p>
                    </div>
                    <RiskBadge
                      level={process.riskLevel as never}
                      score={process.riskScore}
                      compact
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* --------------------------------------------------------- Achados recentes */}
      <section className="mt-5">
        <Card className="overflow-hidden">
          <CardHeader
            title="Achados recentes da análise"
            description="Vulnerabilidades, contradições e ações sugeridas ainda em aberto."
            icon={<IconBrain className="size-4.5" />}
            action={
              <Link
                href="/inteligencia"
                className="text-[12.5px] text-[var(--accent)] hover:underline"
              >
                Central de inteligência
              </Link>
            }
          />
          {data.recentFindings.length === 0 ? (
            <EmptyState
              icon={<IconDocument className="size-5" />}
              title="Nenhum achado registrado ainda"
              description="Envie os documentos de um processo e execute a análise para ver aqui o que exige atenção."
              action={
                <LinkButton href="/processos/novo" variant="primary" size="sm">
                  Criar primeiro processo
                  <IconArrowRight className="size-4" />
                </LinkButton>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.recentFindings.map((finding) => (
                <li key={finding.id}>
                  <Link
                    href={`/processos/${finding.processId}?aba=riscos`}
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <SeverityBadge severity={finding.severity} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{finding.title}</p>
                      <p className="mt-0.5 truncate font-mono text-[11.5px] text-[var(--text-subtle)]">
                        {finding.processNumber} · {relativeTime(finding.createdAt)}
                      </p>
                    </div>
                    <IconChevronRight className="mt-1 size-4 shrink-0 text-[var(--text-subtle)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </PageBody>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const tones = {
    critical: 'var(--risk-critical)',
    warning: 'var(--risk-high)',
    info: 'var(--risk-medium)',
    neutral: 'var(--accent)',
  } as const;

  return (
    <li className="border-b border-[var(--border)] last:border-b-0">
      <Link
        href={item.href}
        className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-[var(--bg-subtle)]"
      >
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: tones[item.tone] }} />
        <span className="flex-1 text-[14px]">{item.label}</span>
        <IconChevronRight className="size-4 shrink-0 text-[var(--text-subtle)]" />
      </Link>
    </li>
  );
}

function Stat({
  label,
  value,
  href,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  href: string;
  tone?: 'neutral' | 'critical' | 'warning';
}) {
  const color =
    tone === 'critical' ? 'var(--risk-critical)' : tone === 'warning' ? 'var(--risk-high)' : 'var(--text)';

  return (
    <Link
      href={href}
      className="card px-4 py-3.5 transition-colors hover:border-[var(--border-strong)]"
    >
      <p className="text-[11.5px] leading-tight text-[var(--text-muted)]">{label}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight" style={{ color }}>
        {value}
      </p>
    </Link>
  );
}
