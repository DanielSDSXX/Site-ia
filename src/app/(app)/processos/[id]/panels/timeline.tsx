'use client';

import { Card, EmptyState, SeverityBadge } from '@/components/ui';
import { useEvidenceViewer } from '@/components/evidence-viewer';
import { formatDateLong } from '@/lib/utils';
import { IconTimeline } from '@/components/icons';
import type { ProcessDto } from '../types';

export function TimelinePanel({ process }: { process: ProcessDto }) {
  const { open } = useEvidenceViewer();
  const events = [...process.timeline].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  if (events.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<IconTimeline className="size-5" />}
          title="Linha do tempo vazia"
          description="Os eventos são extraídos das datas efetivamente citadas nos documentos. Envie as peças e execute a análise do processo."
        />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <ol className="relative space-y-6 border-l border-[var(--border)] pl-6">
        {events.map((event) => {
          const document = process.documents.find((doc) => doc.id === event.documentId);
          return (
            <li key={event.id} className="relative">
              <span
                className="absolute -left-[27px] top-1.5 size-2.5 rounded-full ring-4 ring-[var(--surface)]"
                style={{
                  background:
                    event.importance === 'HIGH'
                      ? 'var(--risk-critical)'
                      : event.importance === 'MEDIUM'
                        ? 'var(--accent)'
                        : 'var(--border-strong)',
                }}
              />

              <div className="flex flex-wrap items-center gap-2">
                <time className="font-mono text-[12px] text-[var(--text-subtle)]">
                  {formatDateLong(event.occurredAt)}
                </time>
                <SeverityBadge severity={event.importance} />
                {event.isInferred && (
                  <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-subtle)]">
                    identificado pela análise
                  </span>
                )}
              </div>

              <p className="mt-1 text-[14.5px] font-semibold">{event.type}</p>
              <p className="text-[13.5px] text-[var(--text-muted)]">{event.title}</p>

              {event.description && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--text-subtle)]">
                  {event.description}
                </p>
              )}

              {document && event.pageNumber !== null && (
                <button
                  type="button"
                  onClick={() =>
                    open({
                      documentId: document.id,
                      documentTitle: document.title,
                      pageNumber: event.pageNumber!,
                    })
                  }
                  className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {document.title} · p. {event.pageNumber}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-6 border-t border-[var(--border)] pt-4 text-[11.5px] leading-relaxed text-[var(--text-subtle)]">
        A linha do tempo é montada a partir das datas presentes no texto dos documentos enviados.
        Ela reflete o que está nos autos indexados — não é um espelho da movimentação oficial do
        tribunal.
      </p>
    </Card>
  );
}
