'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, EmptyState, ErrorNotice, InfoNotice, Spinner } from '@/components/ui';
import { apiGet } from '@/lib/client/api-client';
import { formatDate } from '@/lib/utils';
import { IconExternal, IconScale, IconSearch } from '@/components/icons';
import type { ProcessDto } from '../types';

interface Hit {
  id: string;
  court: string;
  judgingBody: string | null;
  caseNumber: string;
  judgmentDate: string | null;
  reporter: string | null;
  summary: string;
  thesis: string | null;
  outcome: string | null;
  sourceUrl: string | null;
  sourceName: string;
  verified: boolean;
  isDemo: boolean;
  score: number;
}

/**
 * Pesquisa jurisprudencial no acervo importado.
 *
 * A plataforma nunca gera jurisprudência: só encontra o que foi importado com
 * fonte verificável. Um acervo vazio devolve zero resultados — nunca um
 * julgado plausível inventado.
 */
export function JurisprudencePanel({ process }: { process: ProcessDto }) {
  const [query, setQuery] = useState(process.subject ?? '');
  const [results, setResults] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 3) return;

    setLoading(true);
    setError(null);

    const response = await apiGet<{ results: Hit[] }>(
      `/api/jurisprudence?q=${encodeURIComponent(query.trim())}&limit=10`,
    );
    setLoading(false);

    if (!response.ok) {
      setError(response.message);
      return;
    }
    setResults(response.data.results);
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form onSubmit={search} className="flex gap-2">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Descreva a tese: cobrança indevida em cartão de crédito com dano moral"
              className="input pl-9"
            />
          </div>
          <Button type="submit" variant="primary" loading={loading}>
            Pesquisar
          </Button>
        </form>

        <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-subtle)]">
          A busca é semântica e lexical sobre o acervo do seu escritório. Nada aqui é gerado por IA:
          se uma decisão não foi importada com fonte oficial, ela não aparece.
        </p>
      </Card>

      {error && <ErrorNotice>{error}</ErrorNotice>}

      {loading && (
        <p className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <Spinner className="size-4" />
          Consultando o acervo…
        </p>
      )}

      {results !== null && !loading && (
        <Card className="overflow-hidden">
          {results.length === 0 ? (
            <EmptyState
              icon={<IconScale className="size-5" />}
              title="Nenhum resultado no acervo"
              description="Importe decisões com a fonte oficial em Jurisprudência para que elas fiquem pesquisáveis aqui."
              action={
                <Link
                  href="/jurisprudencia"
                  className="text-[13px] font-medium text-[var(--accent)] hover:underline"
                >
                  Ir para Jurisprudência
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {results.map((hit) => (
                <li key={hit.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold">{hit.court}</span>
                    {hit.judgingBody && (
                      <span className="text-[12.5px] text-[var(--text-muted)]">{hit.judgingBody}</span>
                    )}
                    <span className="font-mono text-[12px] text-[var(--text-subtle)]">
                      {hit.caseNumber}
                    </span>
                    {hit.isDemo && <Badge tone="warning">Fictícia — demonstração</Badge>}
                    {!hit.isDemo && hit.verified && <Badge tone="success">Fonte informada</Badge>}
                  </div>

                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                    {hit.summary.slice(0, 600)}
                    {hit.summary.length > 600 ? '…' : ''}
                  </p>

                  {hit.thesis && (
                    <p className="mt-2 border-l-2 border-[var(--accent)] pl-3 text-[13px] leading-relaxed">
                      {hit.thesis}
                    </p>
                  )}

                  <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11.5px] text-[var(--text-subtle)]">
                    {hit.reporter && <span>Relator: {hit.reporter}</span>}
                    {hit.judgmentDate && <span>Julgado em {formatDate(hit.judgmentDate)}</span>}
                    {hit.outcome && <span>Resultado: {hit.outcome}</span>}
                    <span>Relevância {(hit.score * 100).toFixed(0)}%</span>
                    {hit.sourceUrl && (
                      <a
                        href={hit.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                      >
                        <IconExternal className="size-3" />
                        {hit.sourceName}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <InfoNotice>
        A integração automática com bases oficiais de jurisprudência é uma{' '}
        <strong>integração futura</strong>. Hoje o acervo é alimentado por importação manual com URL
        da fonte — decisão de produto para impedir que a plataforma apresente julgados não
        verificáveis.
      </InfoNotice>
    </div>
  );
}
