'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/client/api-client';
import { cn } from '@/lib/utils';
import {
  IconBriefcase,
  IconCheckSquare,
  IconDocument,
  IconProcess,
  IconScale,
  IconSearch,
} from '@/components/icons';
import { Spinner } from '@/components/ui';

interface SearchResult {
  type: 'process' | 'client' | 'document' | 'task' | 'jurisprudence';
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const TYPE_META = {
  process: { label: 'Processo', Icon: IconProcess },
  client: { label: 'Cliente', Icon: IconBriefcase },
  document: { label: 'Documento', Icon: IconDocument },
  task: { label: 'Tarefa', Icon: IconCheckSquare },
  jurisprudence: { label: 'Jurisprudência', Icon: IconScale },
} as const;

/** Busca global (Ctrl+K). Consulta com debounce de 220ms. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      const response = await apiGet<{ results: SearchResult[] }>(
        `/api/search?q=${encodeURIComponent(query.trim())}`,
      );
      if (cancelled) return;
      setResults(response.ok ? response.data.results : []);
      setCursor(0);
      setLoading(false);
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  if (!open) return null;

  const go = (result: SearchResult) => {
    onClose();
    router.push(result.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (event.key === 'Enter' && results[cursor]) {
      event.preventDefault();
      go(results[cursor]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-[var(--shadow-pop)] animate-in"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
          <IconSearch className="size-4 shrink-0 text-[var(--text-subtle)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar por número, parte, cliente, documento…"
            className="h-12 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-[var(--text-subtle)]"
          />
          {loading && <Spinner className="size-4 text-[var(--text-subtle)]" />}
          <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--text-subtle)]">
            esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {query.trim().length < 2 && (
            <p className="px-3 py-8 text-center text-[13px] text-[var(--text-subtle)]">
              Digite ao menos 2 caracteres para buscar.
            </p>
          )}

          {query.trim().length >= 2 && !loading && results.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-[var(--text-subtle)]">
              Nenhum resultado para “{query.trim()}”.
            </p>
          )}

          {results.map((result, index) => {
            const meta = TYPE_META[result.type];
            return (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(result)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  index === cursor ? 'bg-[var(--bg-subtle)]' : '',
                )}
              >
                <meta.Icon className="size-4 shrink-0 text-[var(--text-subtle)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{result.title}</span>
                  {result.subtitle && (
                    <span className="block truncate text-[12px] text-[var(--text-subtle)]">
                      {result.subtitle}
                    </span>
                  )}
                </span>
                <span className="shrink-0 rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-subtle)]">
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
