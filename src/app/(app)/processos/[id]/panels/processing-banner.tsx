'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/client/api-client';
import { Spinner } from '@/components/ui';
import type { DocumentDto } from '../types';

/**
 * Progresso da ingestão.
 *
 * A interface nunca bloqueia durante o processamento — este banner mostra em
 * que etapa cada documento está, com os mesmos nomes usados no pipeline.
 */

interface JobStatus {
  id: string;
  documentId: string | null;
  progress: number;
  label: string | null;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Na fila',
  EXTRACTING: 'Extraindo texto',
  NEEDS_OCR: 'Aplicando OCR',
  CHUNKING: 'Criando índice',
  EMBEDDING: 'Gerando embeddings',
  INDEXED: 'Concluído',
  FAILED: 'Falhou',
};

export function ProcessingBanner({
  processId,
  documents,
  active,
}: {
  processId: string;
  documents: DocumentDto[];
  active: boolean;
}) {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [analysisLabel, setAnalysisLabel] = useState<string | null>(null);

  const pending = documents.filter((doc) => doc.status !== 'INDEXED' && doc.status !== 'FAILED');
  const failed = documents.filter((doc) => doc.status === 'FAILED');

  useEffect(() => {
    if (!active && pending.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      const response = await apiGet<{
        jobs: JobStatus[];
        analysisJobs: { progressLabel: string | null }[];
      }>(`/api/processes/${processId}/status`);
      if (cancelled || !response.ok) return;
      setJobs(response.data.jobs);
      setAnalysisLabel(response.data.analysisJobs[0]?.progressLabel ?? null);
    };

    void tick();
    const timer = setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [processId, active, pending.length]);

  if (pending.length === 0 && failed.length === 0 && !analysisLabel) return null;

  return (
    <div className="mt-4 space-y-2">
      {pending.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="flex items-center gap-2 text-[13.5px] font-medium">
            <Spinner className="size-4 text-[var(--accent)]" />
            Processando documentos… você pode continuar navegando.
          </p>

          <ul className="mt-3 space-y-2.5">
            {pending.map((doc) => {
              const job = jobs.find((item) => item.documentId === doc.id);
              const progress = job?.progress ?? 5;
              return (
                <li key={doc.id}>
                  <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="truncate text-[var(--text)]">{doc.title}</span>
                    <span className="shrink-0 text-[var(--text-subtle)]">
                      {job?.label ?? STATUS_LABELS[doc.status] ?? doc.status}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {analysisLabel && (
        <p className="flex items-center gap-2 rounded-lg bg-[var(--accent-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--accent)]">
          <Spinner className="size-3.5" />
          {analysisLabel}
        </p>
      )}

      {failed.length > 0 && (
        <div
          className="rounded-lg px-3.5 py-3 text-[12.5px] leading-relaxed"
          style={{ background: 'var(--risk-critical-bg)', color: 'var(--risk-critical)' }}
        >
          <strong className="font-semibold">
            {failed.length} documento(s) não puderam ser processados.
          </strong>{' '}
          Abra a aba Documentos para reprocessar. Se o problema persistir, o arquivo pode estar
          protegido por senha ou corrompido.
        </div>
      )}
    </div>
  );
}
