'use client';

import { Card, EmptyState } from '@/components/ui';
import { IconBrain } from '@/components/icons';
import type { ProcessDto } from '../types';

const KIND_LABEL: Record<string, string> = {
  FACT: 'Fato',
  ALLEGATION: 'Alegação',
  REQUEST: 'Pedido',
  THESIS: 'Tese',
  DEFENSE: 'Defesa',
};

/** Teses, pedidos e questões jurídicas extraídas dos autos. */
export function ClaimsPanel({ process }: { process: ProcessDto }) {
  const requests = process.claims.filter((claim) => claim.kind === 'REQUEST');
  const theses = process.claims.filter((claim) => claim.kind === 'THESIS' || claim.kind === 'ALLEGATION');
  const defenses = process.claims.filter((claim) => claim.kind === 'DEFENSE');

  if (process.claims.length === 0 && process.legalIssues.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<IconBrain className="size-5" />}
          title="Estrutura ainda não extraída"
          description="A estrutura do processo (teses, pedidos e questões jurídicas) é preenchida pela análise inicial após a indexação dos documentos."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {process.legalIssues.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h3 className="text-[15px] font-semibold">Questões jurídicas em discussão</h3>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {process.legalIssues.map((issue) => (
              <li key={issue.id} className="px-5 py-3.5">
                <p className="text-[13.5px] font-medium">{issue.title}</p>
                {issue.description && (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                    {issue.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ClaimGroup title="Pedidos" claims={requests} emptyText="Nenhum pedido identificado nos trechos indexados." />
      <ClaimGroup title="Teses e alegações" claims={theses} emptyText="Nenhuma tese identificada." />
      <ClaimGroup title="Matéria de defesa" claims={defenses} emptyText="Nenhuma matéria de defesa identificada." />
    </div>
  );
}

function ClaimGroup({
  title,
  claims,
  emptyText,
}: {
  title: string;
  claims: ProcessDto['claims'];
  emptyText: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-[15px] font-semibold">
          {title}
          <span className="ml-2 text-[12.5px] font-normal text-[var(--text-subtle)]">
            {claims.length}
          </span>
        </h3>
      </div>
      {claims.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-[var(--text-subtle)]">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {claims.map((claim) => (
            <li key={claim.id} className="px-5 py-3.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded bg-[var(--bg-subtle)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  {KIND_LABEL[claim.kind] ?? claim.kind}
                </span>
                <span className="text-[11px] text-[var(--text-subtle)]">
                  {claim.raisedBySide === 'OURS'
                    ? 'Deduzida por nós'
                    : claim.raisedBySide === 'OPPOSING'
                      ? 'Deduzida pela parte contrária'
                      : 'Origem não determinada'}
                </span>
              </div>
              <p className="text-[13.5px] leading-relaxed">{claim.text}</p>
              {claim.strengthRationale && (
                <p className="mt-1 text-[12px] text-[var(--text-subtle)]">{claim.strengthRationale}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
