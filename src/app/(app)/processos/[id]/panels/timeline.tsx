'use client';

import { Card, EmptyState, SeverityBadge } from '@/components/ui';
import { useEvidenceViewer } from '@/components/evidence-viewer';
import { formatDateLong } from '@/lib/utils';
import { IconTimeline } from '@/components/icons';
import type { ProcessDto } from '../types';
import { CnjSyncButton } from './cnj-sync';

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
          description="Os eventos saem das datas citadas nos documentos e das movimentações oficiais do CNJ. Envie as peças e execute a análise, ou traga os andamentos direto do tribunal."
        />
        <div className="border-t border-[var(--border)] px-6 py-4">
          <CnjSyncButton processId={process.id} caseNumber={process.number} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-5 border-b border-[var(--border)] pb-4">
        <CnjSyncButton processId={process.id} caseNumber={process.number} />
      </div>
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

      {/*
        Esta nota precisa acompanhar as fontes que a linha do tempo tem. Ela
        dizia "não é um espelho da movimentação oficial do tribunal", o que
        deixou de ser verdade quando a sincronização com o CNJ passou a gravar
        os andamentos aqui — metade da lista virou exatamente isso.
      */}
      <p className="mt-6 border-t border-[var(--border)] pt-4 text-[11.5px] leading-relaxed text-[var(--text-subtle)]">
        Duas origens, distinguíveis pelo selo de cada evento: os marcados como{' '}
        <strong>identificado pela análise</strong> vêm das datas citadas no texto dos documentos
        enviados; os demais são <strong>movimentações oficiais</strong> trazidas da API Pública do
        CNJ pela sincronização. Os andamentos oficiais só ficam em dia até a última sincronização, e
        cobrem apenas o que o tribunal publica no DataJud.
      </p>
    </Card>
  );
}
