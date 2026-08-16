import type { Metadata } from 'next';
import { requirePlatformAdmin } from '@/lib/auth/session';
import { dailyCostSeries, listOrganizations, platformOverview, recentErrors } from '@/server/admin';
import { PageBody, PageHeader } from '@/components/page-header';
import { Badge, Card, CardHeader, EmptyState, Table, Td, Th } from '@/components/ui';
import { formatCurrencyCents, formatDate, formatUsd, relativeTime } from '@/lib/utils';
import { CostChart } from './cost-chart';

export const metadata: Metadata = { title: 'Administração da plataforma' };
export const dynamic = 'force-dynamic';

/**
 * Painel da plataforma (não do escritório).
 *
 * É a única parte do sistema que cruza organizações, e por isso exige
 * `isPlatformAdmin`. Ver o custo de IA por organização é o que torna o SaaS
 * operável: sem isso, não há como saber se um cliente é lucrativo.
 */
export default async function AdminPage() {
  await requirePlatformAdmin();

  const [overview, organizations, errors, series] = await Promise.all([
    platformOverview(),
    listOrganizations(),
    recentErrors(),
    dailyCostSeries(30),
  ]);

  return (
    <PageBody>
      <PageHeader
        title="Administração da plataforma"
        description="Visão consolidada de organizações, consumo e custo de IA."
      />

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Metric label="Organizações" value={overview.counts.organizations} />
        <Metric label="Usuários" value={overview.counts.users} />
        <Metric label="Ativos (30d)" value={overview.counts.activeUsers30d} />
        <Metric label="Processos" value={overview.counts.processes} />
        <Metric label="Documentos" value={overview.counts.documents} />
        <Metric label="Análises" value={overview.counts.analyses} />
        <Metric
          label="Jobs falhos"
          value={overview.counts.failedJobs}
          tone={overview.counts.failedJobs > 0 ? 'critical' : 'neutral'}
        />
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-[11.5px] text-[var(--text-muted)]">Custo de IA hoje</p>
          <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight">
            {formatUsd(overview.usage.today.totalCostUsd)}
          </p>
          <p className="mt-1.5 text-[11.5px] text-[var(--text-subtle)]">
            {overview.usage.today.totalCalls} chamada(s) ·{' '}
            {overview.usage.today.inputTokens.toLocaleString('pt-BR')} tokens de entrada
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-[11.5px] text-[var(--text-muted)]">Custo de IA no mês</p>
          <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight">
            {formatUsd(overview.usage.month.totalCostUsd)}
          </p>
          <p className="mt-1.5 text-[11.5px] text-[var(--text-subtle)]">
            {overview.usage.month.totalCalls} chamada(s) no ciclo
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-[11.5px] text-[var(--text-muted)]">Receita recorrente mensal</p>
          <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight">
            {formatCurrencyCents(overview.mrrCents)}
          </p>
          <p className="mt-1.5 text-[11.5px] text-[var(--text-subtle)]">
            Soma dos planos com assinatura ativa. Sem provedor de pagamento conectado, é um valor
            contratado, não faturado.
          </p>
        </Card>
      </section>

      <section className="mt-5">
        <Card className="overflow-hidden">
          <CardHeader
            title="Custo de IA nos últimos 30 dias"
            description="Estimativa local a partir da tabela de preços por modelo — não substitui a fatura do provedor."
          />
          <div className="p-5">
            <CostChart data={series} />
          </div>
        </Card>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Consumo por organização (mês)" />
          {overview.topOrganizations.length === 0 ? (
            <EmptyState title="Nenhum consumo registrado no mês" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Organização</Th>
                  <Th>Chamadas</Th>
                  <Th>Custo</Th>
                </tr>
              </thead>
              <tbody>
                {overview.topOrganizations.map((row) => (
                  <tr key={row.organizationId}>
                    <Td className="text-[13px]">{row.name}</Td>
                    <Td className="text-[13px]">{row.calls}</Td>
                    <Td className="text-[13px] font-medium">{formatUsd(row.costUsd)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Custo por funcionalidade (mês)" />
          {overview.usage.month.byOperation.length === 0 ? (
            <EmptyState title="Nenhuma operação registrada" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Operação</Th>
                  <Th>Chamadas</Th>
                  <Th>Custo</Th>
                </tr>
              </thead>
              <tbody>
                {overview.usage.month.byOperation.map((row) => (
                  <tr key={row.operation}>
                    <Td className="text-[13px]">{row.operation}</Td>
                    <Td className="text-[13px]">{row.calls}</Td>
                    <Td className="text-[13px] font-medium">{formatUsd(row.costUsd)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <section className="mt-5">
        <Card className="overflow-hidden">
          <CardHeader title="Organizações" />
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Plano</Th>
                <Th>Assinatura</Th>
                <Th>Membros</Th>
                <Th>Processos</Th>
                <Th>Documentos</Th>
                <Th>Criada em</Th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((organization) => (
                <tr key={organization.id}>
                  <Td className="text-[13px] font-medium">{organization.name}</Td>
                  <Td>
                    <Badge tone="accent">{organization.subscription?.plan.name ?? '—'}</Badge>
                  </Td>
                  <Td>
                    <Badge
                      tone={organization.subscription?.status === 'ACTIVE' ? 'success' : 'neutral'}
                    >
                      {organization.subscription?.status ?? '—'}
                    </Badge>
                  </Td>
                  <Td className="text-[13px]">{organization._count.memberships}</Td>
                  <Td className="text-[13px]">{organization._count.processes}</Td>
                  <Td className="text-[13px]">{organization._count.documents}</Td>
                  <Td className="text-[12.5px] text-[var(--text-muted)]">
                    {formatDate(organization.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </section>

      <section className="mt-5">
        <Card className="overflow-hidden">
          <CardHeader
            title="Erros recentes de processamento"
            description="Jobs que esgotaram as tentativas. A mensagem completa fica no log do servidor, nunca na interface do usuário."
          />
          {errors.length === 0 ? (
            <EmptyState title="Nenhum job com falha" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {errors.map((job) => (
                <li key={job.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[12.5px]">{job.type}</span>
                    <span className="text-[11.5px] text-[var(--text-subtle)]">
                      {relativeTime(job.updatedAt)} · {job.attempts} tentativa(s)
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[12px] text-[var(--risk-critical)]">
                    {job.lastError}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </PageBody>
  );
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'critical';
}) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[11.5px] leading-tight text-[var(--text-muted)]">{label}</p>
      <p
        className="mt-1.5 text-[24px] font-semibold leading-none tracking-tight"
        style={{ color: tone === 'critical' ? 'var(--risk-critical)' : 'var(--text)' }}
      >
        {value}
      </p>
    </Card>
  );
}
