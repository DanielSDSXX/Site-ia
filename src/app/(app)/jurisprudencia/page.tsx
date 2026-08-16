import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { listJurisprudence } from '@/server/jurisprudence';
import { serialize } from '@/server/serialize';
import { PageBody, PageHeader } from '@/components/page-header';
import { InfoNotice } from '@/components/ui';
import { JurisprudenceWorkspace } from './workspace';

export const metadata: Metadata = { title: 'Jurisprudência' };
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
  const items = await listJurisprudence(ctx.organization.id, 200);

  return (
    <PageBody>
      <PageHeader
        title="Jurisprudência"
        description="Busque por processo, ementa ou tema no acervo do escritório e, quando habilitado, também na base oficial do Datajud (CNJ), sempre com validação de fonte."
      />

      <div className="mt-6">
        <JurisprudenceWorkspace
          items={serialize<JurisprudenceRow[]>(items)}
          canWrite={ctx.can('jurisprudence:write')}
        />
      </div>

      <div className="mt-6 space-y-3">
        <InfoNotice>
          <strong>Por que a URL da fonte é obrigatória.</strong> Uma decisão sem link verificável não
          pode ser conferida, e uma ferramenta jurídica que apresenta julgados não conferíveis é pior
          que nenhuma ferramenta. Por isso o cadastro exige a URL oficial, e o chat é instruído a
          nunca citar jurisprudência que não esteja neste acervo.
        </InfoNotice>
        <InfoNotice>
          <strong>Integração futura:</strong> importação automática a partir das bases dos tribunais
          e o Radar de Teses (detecção de tendências por tribunal e período) dependem de acordos de
          acesso às fontes e não estão implementados nesta versão. Nada foi simulado no lugar deles.
        </InfoNotice>
      </div>
    </PageBody>
  );
}
