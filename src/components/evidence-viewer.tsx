'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { PdfViewer } from './pdf-viewer';
import { IconClose, IconEye } from './icons';

/**
 * "Mostre-me a prova".
 *
 * Qualquer citação exibida na interface pode abrir este painel, que carrega o
 * documento na página exata e destaca o trecho. É o que transforma uma
 * afirmação da IA em algo conferível em dois cliques.
 */

interface EvidenceTarget {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  quote?: string | null;
}

interface EvidenceContextValue {
  open: (target: EvidenceTarget) => void;
}

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

export function EvidenceViewerProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<EvidenceTarget | null>(null);

  const open = useCallback((next: EvidenceTarget) => setTarget(next), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <EvidenceContext.Provider value={value}>
      {children}

      {target && (
        <div
          className="fixed inset-0 z-[70] flex justify-end bg-black/45 backdrop-blur-[1px]"
          onClick={() => setTarget(null)}
          role="presentation"
        >
          <div
            className="flex h-full w-full max-w-5xl flex-col bg-[var(--bg)] shadow-[var(--shadow-pop)] animate-in"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Documento ${target.documentTitle}, página ${target.pageNumber}`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Evidência
                </p>
                <p className="truncate text-[14px] font-medium">
                  {target.documentTitle} · página {target.pageNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)]"
                aria-label="Fechar"
              >
                <IconClose className="size-4.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 p-4">
              <PdfViewer
                documentId={target.documentId}
                title={target.documentTitle}
                initialPage={target.pageNumber}
                highlight={target.quote ?? null}
              />
            </div>
          </div>
        </div>
      )}
    </EvidenceContext.Provider>
  );
}

export function useEvidenceViewer() {
  const context = useContext(EvidenceContext);
  if (!context) {
    throw new Error('useEvidenceViewer precisa estar dentro de EvidenceViewerProvider.');
  }
  return context;
}

export interface CitationData {
  id?: string;
  documentId: string | null;
  pageNumber: number | null;
  quote: string;
  document?: { title: string } | null;
}

/** Selo clicável que leva ao documento e à página de origem. */
export function CitationChip({ citation }: { citation: CitationData }) {
  const { open } = useEvidenceViewer();
  if (!citation.documentId || citation.pageNumber === null) return null;

  const title = citation.document?.title ?? 'Documento';

  return (
    <button
      type="button"
      onClick={() =>
        open({
          documentId: citation.documentId!,
          documentTitle: title,
          pageNumber: citation.pageNumber!,
          quote: citation.quote,
        })
      }
      title={citation.quote.slice(0, 300)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      <IconEye className="size-3.5 shrink-0" />
      <span className="truncate">
        {title} · p. {citation.pageNumber}
      </span>
    </button>
  );
}

export function CitationList({ citations }: { citations: CitationData[] }) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {citations.map((citation, index) => (
        <CitationChip key={citation.id ?? index} citation={citation} />
      ))}
    </div>
  );
}

/** Aviso exibido quando um achado não tem nenhuma fonte documental. */
export function NoCitationNotice({ reason }: { reason?: string }) {
  return (
    <p className="mt-3 text-[11.5px] italic text-[var(--text-subtle)]">
      {reason ??
        'Sem citação documental: este ponto trata de algo que NÃO foi encontrado nos autos, e não de um trecho existente.'}
    </p>
  );
}
