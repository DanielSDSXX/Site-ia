import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { listClients } from '@/server/workspace';
import { listMembers } from '@/server/workspace';
import { PageBody, PageHeader } from '@/components/page-header';
import { NewProcessForm } from './form';

export const metadata: Metadata = { title: 'Novo processo' };
export const dynamic = 'force-dynamic';

export default async function NewProcessPage() {
  const ctx = await requirePermission('process:write');

  const [clients, members] = await Promise.all([
    listClients(ctx.organization.id),
    listMembers(ctx.organization.id),
  ]);

  return (
    <PageBody>
      <PageHeader
        breadcrumb={
          <Link href="/processos" className="hover:text-[var(--text-muted)]">
            Processos
          </Link>
        }
        title="Novo processo"
        description="Cadastre o processo e envie as peças. O processamento roda em segundo plano — você pode sair da tela."
      />

      <div className="mt-7 max-w-4xl">
        <NewProcessForm
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
          members={members.map((member) => ({ id: member.user.id, name: member.user.name }))}
          currentUserId={ctx.user.id}
        />
      </div>
    </PageBody>
  );
}
