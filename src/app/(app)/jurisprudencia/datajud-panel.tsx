'use client';

import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, ErrorNotice, InfoNotice, Spinner } from '@/components/ui';
import { apiGet } from '@/lib/client/api-client';
import { IconAlert, IconScale, IconSearch } from '@/components/icons';
import { DatajudProcessCard } from './datajud-process-card';
import type { ConsultResponse, StatusResponse } from './datajud-types';

/**
 * Consulta processual na API Pública do CNJ (DataJud).
 *
 * Fica separada do acervo de jurisprudência de propósito: o DataJud é fonte
 * oficial de ANDAMENTOS, não de ementas. Misturar as duas coisas numa lista só
 * levaria o advogado a citar uma movimentação como se fosse precedente.
 */
export function DatajudPanel({ processes }: { processes: { id: string; number: string }[] }) {
  const [courts, setCourts] = useState<{ value: string; label: string }[]>([]);
  const [status, setStatus] = useState<StatusResponse['status'] | null>(null);
  const [court, setCourt] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ConsultResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await apiGet<StatusResponse>('/api/datajud');
      if (response.ok) {
        setCourts(response.data.courts);
        setStatus(response.data.status);
      }
    })();
  }, []);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setError('Informe o número CNJ do processo ou um termo de busca.');
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ q: trimmed, limit: '10' });
    if (court) params.set('court', court);

    const response = await apiGet<ConsultResponse>(`/api/datajud?${params.toString()}`);
    setLoading(false);

    if (!response.ok) {
      setError(response.message);
      setResult(null);
      return;
    }
    setResult(response.data);
  };

  return (
    <div className="space-y-4">
      {status && !status.enabled && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-dashed px-3.5 py-3 text-[12.5px] leading-relaxed"
          style={{ borderColor: 'var(--risk-medium)', color: 'var(--risk-medium)' }}
        >
          <IconAlert className="mt-px size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Integração desativada.</strong> {status.reason}. Defina{' '}
            <code className="font-mono text-[11.5px]">DATAJUD_ENABLED=true</code> e{' '}
            <code className="font-mono text-[11.5px]">DATAJUD_API_KEY</code> no{' '}
            <code className="font-mono text-[11.5px]">.env</code> e reinicie o servidor. A chave
            pública é publicada pelo CNJ na wiki do DataJud.
          </span>
        </div>
      )}

      {error && <ErrorNotice>{error}</ErrorNotice>}

      <Card className="p-5">
        <form onSubmit={search} className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="0801234-56.2026.8.09.0051 — ou classe, assunto, órgão julgador"
              className="input pl-9"
            />
          </div>

          {/*
            "Detectar pelo número" é o padrão: os dígitos J e TR do número CNJ
            já dizem o tribunal, e escolher errado devolve "não encontrado" por
            motivo errado.
          */}
          <select
            value={court}
            onChange={(event) => setCourt(event.target.value)}
            className="input w-auto min-w-[260px]"
            aria-label="Tribunal"
          >
            <option value="">Detectar pelo número do processo</option>
            {courts.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <Button type="submit" variant="primary" loading={loading}>
            Consultar
          </Button>
        </form>

        <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-subtle)]">
          Consulta direta na API Pública do CNJ, um índice por tribunal. O número CNJ completo é a
          busca mais precisa e dispensa escolher o tribunal; termos livres pesquisam classe,
          assunto, órgão julgador e movimentos, e aí o tribunal precisa ser informado.
        </p>
      </Card>

      {loading && (
        <p className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <Spinner className="size-4" />
          Consultando o DataJud…
        </p>
      )}

      {result?.error && !loading && (
        <div
          className="rounded-lg px-3.5 py-3 text-[13px] leading-relaxed"
          style={{ background: 'var(--risk-critical-bg)', color: 'var(--risk-critical)' }}
        >
          {result.error}
        </div>
      )}

      {result && !result.error && !loading && (
        <>
          <p className="text-[12.5px] text-[var(--text-muted)]">
            {result.total} processo(s) encontrado(s) no índice{' '}
            <code className="font-mono text-[11.5px]">{result.index}</code>
            {result.processes.length < result.total ? ` · exibindo ${result.processes.length}` : ''}
          </p>

          {result.processes.length === 0 ? (
            <Card>
              <EmptyState
                icon={<IconScale className="size-5" />}
                title="Nenhum processo encontrado"
                description="Confira o número CNJ e o tribunal. Cada tribunal tem um índice próprio no DataJud — um processo do TJSP não aparece no índice do TJGO. Processos em segredo de justiça também podem não ser retornados."
              />
            </Card>
          ) : (
            result.processes.map((item) => (
              <DatajudProcessCard key={item.id} item={item} processes={processes} />
            ))
          )}
        </>
      )}

      <InfoNotice>
        <strong>O que esta fonte entrega.</strong> A API Pública do DataJud publica dados
        processuais e movimentações — classe, assuntos, órgão julgador, grau, sigilo e andamentos.
        Ela <strong>não</strong> publica ementa, inteiro teor, tese firmada nem o nome das partes, e
        não tem campo de situação: o rótulo ativo/suspenso/arquivado é deduzido das movimentações e
        vem sempre acompanhado do andamento que o sustenta. Por isso os resultados aqui alimentam a
        linha do tempo do processo, e não o acervo de jurisprudência: um andamento não é precedente.
      </InfoNotice>
    </div>
  );
}
