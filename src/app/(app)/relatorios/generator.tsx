'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, ErrorNotice } from '@/components/ui';
import { downloadFromPost } from '@/lib/client/api-client';
import { cn } from '@/lib/utils';
import { IconDownload, IconReport } from '@/components/icons';

interface ProcessOption {
  id: string;
  number: string;
  subject: string | null;
  clientName: string | null;
  analyzed: boolean;
  findings: number;
  documents: number;
}

const REPORT_TYPES = [
  {
    value: 'executive',
    label: 'Executivo',
    description: 'Identificação, resumo, situação atual e risco. Uma página densa.',
  },
  {
    value: 'client',
    label: 'Para o cliente',
    description: 'Linguagem simples, sem jargão, com glossário. Revise antes de enviar.',
  },
  {
    value: 'internal',
    label: 'Interno',
    description: 'Resumo, vulnerabilidades, contradições, ações e prazos em aberto.',
  },
  {
    value: 'risk',
    label: 'De risco',
    description: 'Foco em vulnerabilidades e contradições, com as fontes de cada achado.',
  },
  {
    value: 'full',
    label: 'Completo',
    description: 'Tudo: análise, adversário, linha do tempo, documentos e prazos.',
  },
] as const;

export function ReportGenerator({ processes }: { processes: ProcessOption[] }) {
  const [processId, setProcessId] = useState(processes[0]?.id ?? '');
  const [type, setType] = useState<string>('executive');
  const [format, setFormat] = useState<'pdf' | 'docx'>('pdf');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = processes.find((process) => process.id === processId);

  const generate = async () => {
    if (!processId) return;
    setLoading(true);
    setError(null);

    const result = await downloadFromPost(
      '/api/reports',
      { processId, type, format },
      `legalmind-${type}.${format}`,
    );

    setLoading(false);
    if (!result.ok) setError(result.message);
  };

  if (processes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<IconReport className="size-5" />}
          title="Nenhum processo cadastrado"
          description="Relatórios são gerados a partir das análises de um processo."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
      <Card className="p-5">
        {error && (
          <div className="mb-4">
            <ErrorNotice>{error}</ErrorNotice>
          </div>
        )}

        <label className="label" htmlFor="report-process">
          Processo
        </label>
        <select
          id="report-process"
          value={processId}
          onChange={(event) => setProcessId(event.target.value)}
          className="input"
        >
          {processes.map((process) => (
            <option key={process.id} value={process.id}>
              {process.number}
              {process.clientName ? ` — ${process.clientName}` : ''}
            </option>
          ))}
        </select>

        {selected && (
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-subtle)]">
            {selected.documents} documento(s) · {selected.findings} achado(s) ·{' '}
            {selected.analyzed ? 'processo já analisado' : 'ainda sem análise executada'}
          </p>
        )}

        {selected && !selected.analyzed && (
          <p
            className="mt-3 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed"
            style={{ background: 'var(--risk-medium-bg)', color: 'var(--risk-medium)' }}
          >
            Este processo ainda não foi analisado. O relatório sairá apenas com os dados cadastrais e
            indicará as seções não disponíveis, em vez de preenchê-las com texto genérico.
          </p>
        )}

        <div className="mt-5">
          <label className="label">Formato</label>
          <div className="flex rounded-lg border border-[var(--border)] p-0.5">
            {(['pdf', 'docx'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFormat(option)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-[12.5px] uppercase transition-colors',
                  format === option
                    ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          className="mt-5 w-full"
          loading={loading}
          onClick={generate}
        >
          <IconDownload className="size-4" />
          Gerar relatório
        </Button>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {REPORT_TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setType(option.value)}
            className={cn(
              'card p-4 text-left transition-all',
              type === option.value
                ? 'ring-1 ring-[var(--accent)]'
                : 'hover:border-[var(--border-strong)]',
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'size-3 rounded-full border-2 transition-colors',
                  type === option.value
                    ? 'border-[var(--accent)] bg-[var(--accent)]'
                    : 'border-[var(--border-strong)]',
                )}
              />
              <span className="text-[14px] font-semibold">{option.label}</span>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              {option.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
