'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IconSearch } from '@/components/icons';

interface Props {
  clients: { id: string; name: string }[];
  current: Record<string, unknown>;
}

const QUICK_FILTERS = [
  { key: 'status', value: 'ACTIVE', label: 'Ativos' },
  { key: 'status', value: 'ARCHIVED', label: 'Arquivados' },
  { key: 'risk', value: 'CRITICAL', label: 'Risco crítico' },
  { key: 'risk', value: 'HIGH', label: 'Risco alto' },
  { key: 'risk', value: 'MEDIUM', label: 'Risco médio' },
  { key: 'risk', value: 'LOW', label: 'Risco baixo' },
  { key: 'deadlineSoon', value: 'true', label: 'Prazo próximo' },
  { key: 'noMovement', value: 'true', label: 'Sem movimentação' },
];

export function ProcessFilters({ clients, current }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(String(current.q ?? ''));

  const apply = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    next.delete('page');
    router.push(`/processos?${next.toString()}`);
  };

  const toggle = (key: string, value: string) => {
    apply({ [key]: params.get(key) === value ? null : value });
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: query.trim() || null });
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Número do processo, parte, cliente, assunto ou advogado responsável"
            className="input pl-9"
          />
        </div>

        <select
          className="input w-auto min-w-[160px]"
          value={String(current.clientId ?? '')}
          onChange={(event) => apply({ clientId: event.target.value || null })}
        >
          <option value="">Todos os clientes</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>

        <select
          className="input w-auto min-w-[150px]"
          value={String(current.sort ?? 'recent')}
          onChange={(event) => apply({ sort: event.target.value })}
        >
          <option value="recent">Mais recentes</option>
          <option value="risk">Maior risco</option>
          <option value="deadline">Prazo mais próximo</option>
          <option value="number">Número</option>
        </select>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_FILTERS.map((filter) => {
          const active = params.get(filter.key) === filter.value;
          return (
            <button
              key={`${filter.key}-${filter.value}`}
              type="button"
              onClick={() => toggle(filter.key, filter.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]',
              )}
            >
              {filter.label}
            </button>
          );
        })}

        {params.size > 0 && (
          <button
            type="button"
            onClick={() => router.push('/processos')}
            className="rounded-full px-3 py-1 text-[12.5px] text-[var(--text-subtle)] underline-offset-2 hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
