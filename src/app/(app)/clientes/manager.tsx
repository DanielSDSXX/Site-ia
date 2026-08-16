'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorNotice, Table, Td, Th } from '@/components/ui';
import { apiDelete, apiPost } from '@/lib/client/api-client';
import { IconBriefcase, IconPlus } from '@/components/icons';
import type { ClientRow } from './page';

export function ClientsManager({
  clients,
  canWrite,
}: {
  clients: ClientRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await apiPost('/api/clients', {
      name: String(form.get('name') ?? ''),
      type: String(form.get('type') ?? 'INDIVIDUAL'),
      email: String(form.get('email') ?? '') || null,
      phone: String(form.get('phone') ?? '') || null,
      notes: String(form.get('notes') ?? '') || null,
    });

    setLoading(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setShowForm(false);
    router.refresh();
  };

  const remove = async (client: ClientRow) => {
    if (client._count.processes > 0) {
      setError(
        `${client.name} tem ${client._count.processes} processo(s) vinculado(s). Desvincule-os antes de excluir.`,
      );
      return;
    }
    if (!confirm(`Excluir o cliente ${client.name}?`)) return;
    await apiDelete(`/api/clients/${client.id}`);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {error && <ErrorNotice>{error}</ErrorNotice>}

      {canWrite && (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={() => setShowForm((value) => !value)}>
            <IconPlus className="size-3.5" />
            Novo cliente
          </Button>
        </div>
      )}

      {showForm && (
        <Card className="p-5">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="client-name">
                Nome *
              </label>
              <input id="client-name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="client-type">
                Tipo
              </label>
              <select id="client-type" name="type" className="input" defaultValue="INDIVIDUAL">
                <option value="INDIVIDUAL">Pessoa física</option>
                <option value="COMPANY">Pessoa jurídica</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="client-email">
                E-mail
              </label>
              <input id="client-email" name="email" type="email" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="client-phone">
                Telefone
              </label>
              <input id="client-phone" name="phone" className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="client-notes">
                Observações
              </label>
              <textarea id="client-notes" name="notes" rows={2} className="input resize-y" />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={loading}>
                Salvar cliente
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        {clients.length === 0 ? (
          <EmptyState
            icon={<IconBriefcase className="size-5" />}
            title="Nenhum cliente cadastrado"
            description="Vincular processos a clientes facilita filtrar a carteira e gerar relatórios."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Contato</Th>
                <Th>Processos</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="transition-colors hover:bg-[var(--bg-subtle)]">
                  <Td className="text-[13.5px] font-medium">{client.name}</Td>
                  <Td>
                    <Badge>{client.type === 'COMPANY' ? 'Pessoa jurídica' : 'Pessoa física'}</Badge>
                  </Td>
                  <Td className="text-[12.5px] text-[var(--text-muted)]">
                    {[client.email, client.phone].filter(Boolean).join(' · ') || '—'}
                  </Td>
                  <Td className="text-[13px]">{client._count.processes}</Td>
                  <Td>
                    {canWrite && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => remove(client)}
                          className="rounded px-2 py-1 text-[12px] text-[var(--text-subtle)] transition-colors hover:text-[var(--risk-critical)]"
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
