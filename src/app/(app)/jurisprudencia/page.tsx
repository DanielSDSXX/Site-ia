import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { listJurisprudence } from '@/server/jurisprudence';
import { PageBody, PageHeader } from '@/components/page-header';
import { LegalSearchWorkspace } from './search-workspace';

export const metadata: Metadata = { title: 'Busca jurídica' };
export const dynamic = 'force-dynamic';

export default async function JurisprudencePage() {
  const ctx = await requirePermission('jurisprudence:read');

  const [acervo, processes] = await Promise.all([
    listJurisprudence(ctx.organization.id, 200),
    prisma.process.findMany({
      where: { organizationId: ctx.organization.id, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, number: true },
      take: 200,
    }),
  ]);

  // Só o número importa aqui: serve para oferecer a caixa "incluir exemplos
  // fictícios" apenas quando existe algum.
  const demoCount = acervo.filter((item) => item.isDemo).length;

  return (
    <PageBody>
      <PageHeader
        title="Busca jurídica"
        description="Digite o número do processo ou uma palavra-chave. A plataforma consulta os processos no CNJ e os entendimentos do acervo do escritório."
      />

      <div className="mt-6">
        <LegalSearchWorkspace
          processes={processes}
          canWrite={ctx.can('jurisprudence:write')}
          demoCount={demoCount}
        />
      </div>
    </PageBody>
  );
}
