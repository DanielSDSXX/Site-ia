import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { listDeadlines, listMembers, reconcileOverdueDeadlines } from '@/server/workspace';
import { serialize } from '@/server/serialize';
import { PageBody, PageHeader } from '@/components/page-header';
import { Card, InfoNotice } from '@/components/ui';
import { DeadlineCalendar } from './calendar';

export const metadata: Metadata = { title: 'Prazos' };
export const dynamic = 'force-dynamic';

export interface DeadlineRow {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: string;
  priority: string;
  computed: boolean;
  computationNote: string | null;
  legalBasis: string | null;
  process: { id: string; number: string } | null;
  responsible: { id: string; name: string; avatarColor: string } | null;
}

export default async function DeadlinesPage() {
  const ctx = await requirePermission('deadline:read');
  await reconcileOverdueDeadlines(ctx.organization.id);

  const [deadlines, members] = await Promise.all([
    listDeadlines(ctx.organization.id),
    listMembers(ctx.organization.id),
  ]);

  return (
    <PageBody>
      <PageHeader
        title="Prazos"
        description="Agenda do escritório. Alertas são gerados 7, 3 e 1 dia antes do vencimento, e no próprio dia."
      />

      <div className="mt-6">
        <DeadlineCalendar
          deadlines={serialize<DeadlineRow[]>(deadlines)}
          members={members.map((member) => ({ id: member.user.id, name: member.user.name }))}
          canWrite={ctx.can('deadline:write')}
        />
      </div>

      <div className="mt-6">
        <InfoNotice>
          <strong>Sobre o cálculo automático.</strong> A plataforma aplica a regra geral do CPC —
          dias úteis (art. 219), exclusão do dia do começo (art. 224), prorrogação para o próximo dia
          útil e recesso forense de 20/12 a 20/01 (art. 220) — mais os feriados nacionais. Ela não
          conhece feriados locais, suspensões de cada tribunal, prazos em dobro nem regimes
          especiais. Os prazos calculados aparecem marcados; confira antes de confiar na data.
        </InfoNotice>
      </div>
    </PageBody>
  );
}
