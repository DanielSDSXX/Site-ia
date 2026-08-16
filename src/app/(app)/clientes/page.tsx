import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { listClients } from '@/server/workspace';
import { serialize } from '@/server/serialize';
import { PageBody, PageHeader } from '@/components/page-header';
import { ClientsManager } from './manager';

export const metadata: Metadata = { title: 'Clientes' };
export const dynamic = 'force-dynamic';

export interface ClientRow {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  _count: { processes: number };
}

export default async function ClientsPage() {
  const ctx = await requirePermission('client:read');
  const clients = await listClients(ctx.organization.id);

  return (
    <PageBody>
      <PageHeader
        title="Clientes"
        description="Cadastro mínimo por escolha de projeto: guardamos apenas o necessário para operar os processos."
      />

      <div className="mt-6">
        <ClientsManager
          clients={serialize<ClientRow[]>(clients)}
          canWrite={ctx.can('client:write')}
        />
      </div>
    </PageBody>
  );
}
