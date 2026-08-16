'use client';

import { useState } from 'react';
import { Button, ErrorNotice, Spinner } from '@/components/ui';
import { apiGet, apiPost } from '@/lib/client/api-client';
import { cn } from '@/lib/utils';
import {
  IconAlert,
  IconBrain,
  IconRefresh,
  IconScale,
  IconSwords,
  IconTarget,
  IconUsers,
} from '@/components/icons';

/**
 * Barra de ações de inteligência.
 *
 * "PRÓXIMA AÇÃO" é o botão de maior destaque por decisão de produto: a
 * pergunta que o advogado abre a plataforma para responder é "o que eu faço
 * agora?", não "me resuma o processo".
 */

interface Action {
  key: string;
  endpoint: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
}

const ACTIONS: Action[] = [
  {
    key: 'next',
    endpoint: 'next-actions',
    label: 'Próxima ação',
    hint: 'O que merece atenção agora, em ordem de prioridade.',
    icon: IconTarget,
    primary: true,
  },
  {
    key: 'vuln',
    endpoint: 'vulnerabilities',
    label: 'Encontrar vulnerabilidades',
    hint: 'Onde a nossa posição está frágil e por quê.',
    icon: IconAlert,
  },
  {
    key: 'adversarial',
    endpoint: 'adversarial-analysis',
    label: 'Simular adversário',
    hint: 'O que a parte contrária deve sustentar — e como rebater.',
    icon: IconSwords,
  },
  {
    key: 'simulate',
    endpoint: 'simulate',
    label: 'Simulação analítica',
    hint: 'Organiza o material decisório. Não prevê a sentença.',
    icon: IconScale,
  },
  {
    key: 'contradictions',
    endpoint: 'contradictions',
    label: 'Encontrar contradições',
    hint: 'Datas, valores e versões incompatíveis entre peças.',
    icon: IconRefresh,
  },
  {
    key: 'evidence',
    endpoint: 'evidence-map',
    label: 'Mapa de provas',
    hint: 'Quais alegações têm lastro documental e quais não têm.',
    icon: IconBrain,
  },
  {
    key: 'client',
    endpoint: 'client-explanation',
    label: 'Explicar para o cliente',
    hint: 'A mesma situação, sem jargão jurídico.',
    icon: IconUsers,
  },
];

export function IntelligenceBar({
  processId,
  hasDocuments,
  onStarted,
  onFinished,
}: {
  processId: string;
  hasDocuments: boolean;
  onStarted: () => void;
  onFinished: () => void;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const run = async (action: Action) => {
    setError(null);
    setRunning(action.key);
    setStatus('Enviando para a fila de análise…');
    onStarted();

    const response = await apiPost<{ jobId: string }>(
      `/api/processes/${processId}/${action.endpoint}`,
    );

    if (!response.ok) {
      setError(response.message);
      setRunning(null);
      setStatus(null);
      return;
    }

    await waitForJob(response.data.jobId, setStatus);
    setRunning(null);
    setStatus(null);
    onFinished();
  };

  return (
    <div>
      {error && (
        <div className="mb-3">
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      )}

      {!hasDocuments && (
        <p className="mb-3 rounded-lg bg-[var(--bg-subtle)] px-3.5 py-2.5 text-[12.5px] text-[var(--text-muted)]">
          Nenhum documento indexado ainda. As análises ficam disponíveis quando ao menos uma peça
          terminar de ser processada.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => {
          const isRunning = running === action.key;
          return (
            <button
              key={action.key}
              type="button"
              disabled={!hasDocuments || running !== null}
              onClick={() => run(action)}
              title={action.hint}
              className={cn(
                'group flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-all',
                'disabled:cursor-not-allowed disabled:opacity-50',
                action.primary
                  ? 'border-transparent bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm hover:bg-[var(--accent-hover)]'
                  : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]',
              )}
            >
              {isRunning ? <Spinner className="size-4" /> : <action.icon className="size-4" />}
              {action.label}
            </button>
          );
        })}
      </div>

      {status && (
        <p className="mt-2.5 flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          <Spinner className="size-3.5" />
          {status}
        </p>
      )}

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--text-subtle)]">
        As análises são estratégicas e probabilísticas. Nenhuma delas afirma o resultado do
        julgamento, e cada afirmação factual leva ao documento e à página de origem.
      </p>
    </div>
  );
}

/** Acompanha o job até concluir, com timeout de ~3 minutos. */
async function waitForJob(jobId: string, onStatus: (message: string) => void) {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const response = await apiGet<{ status: string; progressLabel: string | null }>(
      `/api/jobs/${jobId}`,
    );
    if (!response.ok) continue;

    const { status, progressLabel } = response.data;
    if (progressLabel) onStatus(progressLabel);

    if (status === 'COMPLETED') return true;
    if (status === 'FAILED') {
      onStatus('A análise não pôde ser concluída.');
      return false;
    }
  }

  onStatus('A análise está demorando mais que o esperado e continua em segundo plano.');
  return false;
}
