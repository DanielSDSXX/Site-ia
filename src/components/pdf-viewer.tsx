'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner } from './ui';
import { IconChevronDown, IconChevronRight, IconDownload, IconSearch } from './icons';

/**
 * Visualizador de PDF integrado.
 *
 * Renderiza via pdf.js em canvas, carregando o arquivo pelo endpoint
 * autenticado (nunca por URL pública). O worker é servido de /public para
 * respeitar a CSP — nenhuma requisição a CDN.
 *
 * O ponto central é `initialPage`: quando a IA cita "página 37", o usuário
 * clica e cai exatamente ali.
 */

interface Props {
  documentId: string;
  title: string;
  initialPage?: number;
  highlight?: string | null;
  onPageChange?: (page: number) => void;
}

type PdfDocumentProxy = {
  numPages: number;
  getPage: (page: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
};

type PdfPageProxy = {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
  cleanup: () => void;
};

export function PdfViewer({ documentId, title, initialPage = 1, highlight, onPageChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PdfDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [page, setPage] = useState(initialPage);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageText, setPageText] = useState<string | null>(null);
  const [showText, setShowText] = useState(Boolean(highlight));

  // Carrega o documento uma única vez.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const response = await fetch(`/api/documents/${documentId}/content`, {
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error('fetch failed');

        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        const task = pdfjs.getDocument({
          data: new Uint8Array(buffer),
          isEvalSupported: false,
        });
        const doc = (await task.promise) as unknown as PdfDocumentProxy;
        if (cancelled) {
          await doc.destroy();
          return;
        }

        docRef.current = doc;
        setPageCount(doc.numPages);
        setPage((current) => Math.min(Math.max(current, 1), doc.numPages));
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Não foi possível abrir este documento no visualizador.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      void docRef.current?.destroy();
      docRef.current = null;
    };
  }, [documentId]);

  useEffect(() => setPage(initialPage), [initialPage]);

  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    renderTaskRef.current?.cancel();

    try {
      const pdfPage = await doc.getPage(page);
      const viewport = pdfPage.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
      canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`;

      const task = pdfPage.render({ canvasContext: context, viewport });
      renderTaskRef.current = task;
      await task.promise;
      pdfPage.cleanup();
    } catch {
      /* render cancelado por troca de página — comportamento esperado */
    }
  }, [page, scale]);

  useEffect(() => {
    if (!loading && !error) void renderPage();
  }, [loading, error, renderPage]);

  useEffect(() => {
    onPageChange?.(page);
  }, [page, onPageChange]);

  // Texto extraído da página, usado para destacar o trecho citado.
  useEffect(() => {
    if (!showText) return;
    let cancelled = false;

    (async () => {
      const response = await fetch(`/api/documents/${documentId}/pages?page=${page}`, {
        credentials: 'same-origin',
      });
      if (!response.ok || cancelled) return;
      const data = (await response.json()) as { text?: string };
      if (!cancelled) setPageText(data.text ?? '');
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, page, showText]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <p className="mr-auto min-w-0 truncate text-[13px] font-medium">{title}</p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-40"
            aria-label="Página anterior"
          >
            <IconChevronRight className="size-4 rotate-180" />
          </button>

          <input
            type="number"
            value={page}
            min={1}
            max={pageCount || 1}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) setPage(Math.min(Math.max(1, value), pageCount || 1));
            }}
            className="h-7 w-14 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 text-center text-[12.5px]"
            aria-label="Número da página"
          />
          <span className="text-[12.5px] text-[var(--text-subtle)]">/ {pageCount || '—'}</span>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount || 1, p + 1))}
            disabled={page >= pageCount}
            className="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-40"
            aria-label="Próxima página"
          >
            <IconChevronRight className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-l border-[var(--border)] pl-2">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            className="rounded px-2 py-1 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            aria-label="Diminuir zoom"
          >
            −
          </button>
          <span className="w-10 text-center text-[11.5px] text-[var(--text-subtle)]">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            className="rounded px-2 py-1 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            aria-label="Aumentar zoom"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowText((value) => !value)}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[12.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)]"
          title="Mostrar o texto extraído desta página"
        >
          <IconSearch className="size-3.5" />
          Texto
          <IconChevronDown className={`size-3 transition-transform ${showText ? 'rotate-180' : ''}`} />
        </button>

        <a
          href={`/api/documents/${documentId}/content?download=1`}
          className="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)]"
          title="Baixar documento"
        >
          <IconDownload className="size-4" />
        </a>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex-1 overflow-auto bg-[var(--bg-subtle)] p-4">
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[var(--text-muted)]">
              <Spinner className="size-4" />
              Carregando documento…
            </div>
          )}

          {error && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-[13.5px] text-[var(--text-muted)]">{error}</p>
              <Button size="sm" onClick={() => window.open(`/api/documents/${documentId}/content?download=1`)}>
                <IconDownload className="size-3.5" />
                Baixar arquivo
              </Button>
            </div>
          )}

          {!loading && !error && (
            <canvas ref={canvasRef} className="mx-auto shadow-[var(--shadow-card)]" />
          )}
        </div>

        {showText && (
          <aside className="w-[38%] min-w-[280px] shrink-0 overflow-y-auto border-l border-[var(--border)] p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Texto extraído — página {page}
            </p>
            {pageText === null ? (
              <Spinner className="size-4 text-[var(--text-subtle)]" />
            ) : pageText.trim().length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                Esta página não tem camada de texto. Provavelmente é uma digitalização — o conteúdo
                dela não entrou na análise. Ative o OCR para incluí-la.
              </p>
            ) : (
              <HighlightedText text={pageText} highlight={highlight} />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/** Destaca o trecho citado dentro do texto da página. */
function HighlightedText({ text, highlight }: { text: string; highlight?: string | null }) {
  if (!highlight) {
    return (
      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--text-muted)]">
        {text}
      </p>
    );
  }

  // Casa por uma âncora curta do início da citação: o trecho salvo pode ter
  // sido truncado ou normalizado, mas o começo costuma bater.
  const anchor = highlight.replace(/\s+/g, ' ').trim().slice(0, 60);
  const index = text.toLowerCase().indexOf(anchor.toLowerCase());

  if (index === -1) {
    return (
      <>
        <p className="mb-3 rounded-lg bg-[var(--accent-soft)] p-2.5 text-[12.5px] leading-relaxed text-[var(--text)]">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Trecho citado
          </span>
          {highlight}
        </p>
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          {text}
        </p>
      </>
    );
  }

  const end = Math.min(text.length, index + highlight.length);
  return (
    <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--text-muted)]">
      {text.slice(0, index)}
      <mark
        className="rounded px-0.5"
        style={{ background: 'var(--accent-soft)', color: 'var(--text)' }}
      >
        {text.slice(index, end)}
      </mark>
      {text.slice(end)}
    </p>
  );
}
