'use client';

import { useState } from 'react';
import { Button, ConfidenceBadge, SeverityBadge } from '@/components/ui';
import { CitationList, NoCitationNotice } from '@/components/evidence-viewer';
import { apiPost } from '@/lib/client/api-client';
import { IconCheckSquare, IconPlus } from '@/components/icons';
import type { FindingDto } from '../types';

/**
 * Cartão de achado — a unidade de saída da inteligência.
 *
 * A estrutura segue o que o briefing pede para cada vulnerabilidade:
 * descrição, evidência (com link para a página), gravidade, por que importa e
 * o que poderia ser feito. A separação entre "fato documentado" e "sugestão"
 * é visual, não apenas textual.
 */
export function FindingCard({
  finding,
  canTasks,
  gapReason,
}: {
  finding: FindingDto;
  canTasks?: boolean;
  gapReason?: string;
}) {
  const [taskCreated, setTaskCreated] = useState(false);
  const [creating, setCreating] = useState(false);

  const createTask = async () => {
    setCreating(true);
    const response = await apiPost('/api/tasks', { fromFindingId: finding.id });
    setCreating(false);
    if (response.ok) setTaskCreated(true);
  };

  return (
    <article className="border-b border-[var(--border)] px-5 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} prefix="Gravidade" />
            <ConfidenceBadge confidence={finding.confidence} />
          </div>
          <h4 className="text-[14.5px] font-semibold leading-snug">{finding.title}</h4>
        </div>

        {canTasks && (
          <Button
            size="sm"
            variant={taskCreated ? 'subtle' : 'secondary'}
            onClick={createTask}
            disabled={taskCreated}
            loading={creating}
            className="shrink-0"
          >
            {taskCreated ? (
              <>
                <IconCheckSquare className="size-3.5" />
                Tarefa criada
              </>
            ) : (
              <>
                <IconPlus className="size-3.5" />
                Virar tarefa
              </>
            )}
          </Button>
        )}
      </div>

      <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--text-muted)]">
        {finding.description}
      </p>

      {finding.rationale && (
        <div className="mt-3 border-l-2 border-[var(--border-strong)] pl-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Por que isso importa
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
            {finding.rationale}
          </p>
        </div>
      )}

      {finding.suggestion && (
        <div
          className="mt-3 rounded-lg px-3.5 py-2.5"
          style={{ background: 'var(--accent-soft)' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Sugestão — decisão do advogado
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text)]">{finding.suggestion}</p>
        </div>
      )}

      {finding.citations.length > 0 ? (
        <CitationList citations={finding.citations} />
      ) : (
        <NoCitationNotice reason={gapReason} />
      )}
    </article>
  );
}
