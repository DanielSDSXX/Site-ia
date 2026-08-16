import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { PageBody, PageHeader } from '@/components/page-header';
import { InfoNotice } from '@/components/ui';
import { ReportGenerator } from './generator';

export const metadata: Metadata = { title: 'Relatórios' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const ctx = await requirePermission('report:generate');

  const processes = await prisma.process.findMany({
    where: { organizationId: ctx.organization.id, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      number: true,
      subject: true,
      lastAnalyzedAt: true,
      client: { select: { name: true } },
      _count: { select: { findings: true, documents: true } },
    },
  });

  return (
    <PageBody>
      <PageHeader
        title="Relatórios"
        description="Exporte o que já foi analisado em PDF ou DOCX. Nenhuma análise nova é executada na geração."
      />

      <div className="mt-6">
        <ReportGenerator
          processes={processes.map((process) => ({
            id: process.id,
            number: process.number,
            subject: process.subject,
            clientName: process.client?.name ?? null,
            analyzed: Boolean(process.lastAnalyzedAt),
            findings: process._count.findings,
            documents: process._count.documents,
          }))}
        />
      </div>

      <div className="mt-6">
        <InfoNotice>
          Todo relatório sai com o aviso de que as análises são estratégicas e probabilísticas, não
          constituem parecer jurídico e não substituem a avaliação do advogado responsável. Se as
          análises tiverem sido produzidas sem um modelo de linguagem conectado, o documento diz isso
          na primeira página.
        </InfoNotice>
      </div>
    </PageBody>
  );
}
