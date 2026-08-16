import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { listProcesses, RISK_LABELS, STATUS_LABELS } from '@/server/processes';
import { listClients } from '@/server/workspace';
import { processFiltersSchema } from '@/lib/validation';
import { PageBody, PageHeader } from '@/components/page-header';
import { Badge, Card, EmptyState, LinkButton, RiskBadge, Table, Td, Th } from '@/components/ui';
import { daysUntil, formatDate, relativeTime } from '@/lib/utils';
import { IconPlus, IconProcess } from '@/components/icons';
import { ProcessFilters } from './filters';

export const metadata: Metadata = { title: 'Processos' };
export const dynamic = 'force-dynamic';

export default async function ProcessesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission('process:read');
  const raw = await searchParams;

  const parsed = processFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : processFiltersSchema.parse({});

  const [result, clients] = await Promise.all([
    listProcesses(ctx.organization.id, filters),
    listClients(ctx.organization.id),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <PageBody>
      <PageHeader
        title="Processos"
        description={`${result.total} processo(s) neste escritório.`}
        action={
          ctx.can('process:write') && (
            <LinkButton href="/processos/novo" variant="primary" size="md">
              <IconPlus className="size-4" />
              Novo processo
            </LinkButton>
          )
        }
      />

      <div className="mt-6">
        <ProcessFilters
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
          current={filters}
        />
      </div>

      <Card className="mt-4 overflow-hidden">
        {result.items.length === 0 ? (
          <EmptyState
            icon={<IconProcess className="size-5" />}
            title="Nenhum processo encontrado"
            description="Ajuste os filtros ou cadastre um novo processo para começar a analisar."
            action={
              ctx.can('process:write') && (
                <LinkButton href="/processos/novo" variant="primary" size="sm">
                  Cadastrar processo
                </LinkButton>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Cliente / parte contrária</Th>
                <Th>Tribunal / vara</Th>
                <Th>Assunto</Th>
                <Th>Situação</Th>
                <Th>Risco</Th>
                <Th>Próximo prazo</Th>
                <Th>Última análise</Th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((process) => {
                const days = process.nextDeadline ? daysUntil(process.nextDeadline.dueDate) : null;
                return (
                  <tr key={process.id} className="transition-colors hover:bg-[var(--bg-subtle)]">
                    <Td>
                      <Link
                        href={`/processos/${process.id}`}
                        className="font-mono text-[12.5px] font-medium text-[var(--accent)] hover:underline"
                      >
                        {process.number}
                      </Link>
                      {process.isDemo && (
                        <Badge tone="warning" className="ml-2">
                          Demonstração
                        </Badge>
                      )}
                      <p className="mt-0.5 text-[11.5px] text-[var(--text-subtle)]">
                        {process.documentCount} doc. · {process.findingCount} achado(s)
                      </p>
                    </Td>
                    <Td>
                      <p className="text-[13px]">{process.clientName ?? '—'}</p>
                      <p className="text-[11.5px] text-[var(--text-subtle)]">
                        {process.opposingName ? `× ${process.opposingName}` : 'Parte contrária não cadastrada'}
                      </p>
                    </Td>
                    <Td>
                      <p className="text-[13px]">{process.court ?? '—'}</p>
                      <p className="text-[11.5px] text-[var(--text-subtle)]">{process.courtUnit ?? '—'}</p>
                    </Td>
                    <Td className="max-w-[220px]">
                      <p className="truncate text-[13px]">{process.subject ?? '—'}</p>
                      <p className="truncate text-[11.5px] text-[var(--text-subtle)]">
                        {process.procedureClass ?? '—'}
                      </p>
                    </Td>
                    <Td>
                      <Badge>{STATUS_LABELS[process.status] ?? process.status}</Badge>
                    </Td>
                    <Td>
                      <RiskBadge level={process.riskLevel} score={process.riskScore} compact />
                    </Td>
                    <Td>
                      {process.nextDeadline ? (
                        <span
                          className="text-[12.5px] font-medium"
                          style={{
                            color:
                              days !== null && days <= 3 ? 'var(--risk-critical)' : 'var(--text)',
                          }}
                        >
                          {formatDate(process.nextDeadline.dueDate)}
                          <span className="ml-1 font-normal text-[var(--text-subtle)]">
                            ({days} d)
                          </span>
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-[var(--text-subtle)]">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-[var(--text-muted)]">
                        {process.lastAnalyzedAt ? relativeTime(process.lastAnalyzedAt) : 'Nunca'}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[13px] text-[var(--text-muted)]">
          <span>
            Página {result.page} de {totalPages} · {result.total} resultado(s)
          </span>
          <div className="flex gap-2">
            {result.page > 1 && (
              <PageLink params={raw} page={result.page - 1} label="Anterior" />
            )}
            {result.page < totalPages && (
              <PageLink params={raw} page={result.page + 1} label="Próxima" />
            )}
          </div>
        </div>
      )}

      <p className="mt-6 text-[12px] text-[var(--text-subtle)]">
        Níveis de risco: {Object.values(RISK_LABELS).join(' · ')}. O risco é estimado pela análise a
        partir de sinais objetivos dos autos e não representa previsão de resultado.
      </p>
    </PageBody>
  );
}

function PageLink({
  params,
  page,
  label,
}: {
  params: Record<string, string | string[] | undefined>;
  page: number;
  label: string;
}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && key !== 'page') search.set(key, value);
  }
  search.set('page', String(page));

  return (
    <Link
      href={`/processos?${search.toString()}`}
      className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 transition-colors hover:bg-[var(--bg-subtle)]"
    >
      {label}
    </Link>
  );
}
