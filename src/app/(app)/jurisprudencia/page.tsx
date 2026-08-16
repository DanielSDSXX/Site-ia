import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { listJurisprudence } from '@/server/jurisprudence';
import { serialize } from '@/server/serialize';
import { datajudStatus } from '@/lib/integrations/datajud';
import { PageBody, PageHeader } from '@/components/page-header';
import { JurisprudenceTabs } from './tabs';

export const metadata: Metadata = { title: 'Jurisprudência e consulta processual' };
export const dynamic = 'force-dynamic';

export interface JurisprudenceRow {
  id: string;
  court: string;
  judgingBody: string | null;
  caseNumber: string;
  judgmentDate: string | null;
  reporter: string | null;
  summary: string;
  thesis: string | null;
  outcome: string | null;
  sourceUrl: string | null;
  sourceName: string;
  verified: boolean;
  isDemo: boolean;
  organizationId: string | null;
}

export default async function JurisprudencePage() {
  const ctx = await requirePermission('jurisprudence:read');

  const [items, processes] = await Promise.all([
    listJurisprudence(ctx.organization.id, 200),
    prisma.process.findMany({
      where: { organizationId: ctx.organization.id, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, number: true },
      take: 200,
    }),
  ]);

  return (
    <PageBody>
      <PageHeader
        title="Jurisprudência e consulta processual"
        description="Duas fontes distintas: o acervo de ementas do escritório e a consulta processual oficial do CNJ. A plataforma não gera decisões."
      />

      <div className="mt-6">
        <JurisprudenceTabs
          items={serialize<JurisprudenceRow[]>(items)}
          processes={processes}
          canWrite={ctx.can('jurisprudence:write')}
          datajud={datajudStatus()}
        />
      </div>
    </PageBody>
  );
}
