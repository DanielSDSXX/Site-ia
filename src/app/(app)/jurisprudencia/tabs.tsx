'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { JurisprudenceWorkspace } from './workspace';
import { DatajudPanel } from './datajud-panel';
import type { JurisprudenceRow } from './page';

type Tab = 'acervo' | 'datajud';

/**
 * Duas abas porque são duas fontes com naturezas diferentes:
 *
 *  - Acervo: ementas importadas com link verificável. Serve para citar.
 *  - DataJud: dados processuais oficiais do CNJ. Serve para acompanhar.
 *
 * Mantê-las separadas evita o erro mais caro possível aqui — tratar uma
 * movimentação processual como se fosse precedente.
 */
export function JurisprudenceTabs({
  items,
  processes,
  canWrite,
  datajud,
}: {
  items: JurisprudenceRow[];
  processes: { id: string; number: string }[];
  canWrite: boolean;
  datajud: { enabled: boolean; reason: string | null; index: string };
}) {
  const [tab, setTab] = useState<Tab>('acervo');

  return (
    <div>
      <div className="border-b border-[var(--border)]">
        <nav className="flex gap-0.5" role="tablist">
          <TabButton active={tab === 'acervo'} onClick={() => setTab('acervo')}>
            Acervo de ementas
            <span className="ml-1.5 rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-subtle)]">
              {items.length}
            </span>
          </TabButton>

          <TabButton active={tab === 'datajud'} onClick={() => setTab('datajud')}>
            Consulta processual — CNJ DataJud
            {datajud.enabled ? (
              <Badge tone="success" className="ml-1.5">
                ativa
              </Badge>
            ) : (
              <Badge tone="warning" className="ml-1.5">
                desativada
              </Badge>
            )}
          </TabButton>
        </nav>
      </div>

      <div className="mt-6">
        {tab === 'acervo' ? (
          <JurisprudenceWorkspace items={items} canWrite={canWrite} />
        ) : (
          <DatajudPanel processes={processes} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative flex items-center whitespace-nowrap px-3.5 py-2.5 text-[13.5px] transition-colors',
        active
          ? 'font-medium text-[var(--text)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text)]',
      )}
    >
      {children}
      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" />
      )}
    </button>
  );
}
