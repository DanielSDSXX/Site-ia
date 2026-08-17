'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorNotice, InfoNotice, Spinner } from '@/components/ui';
import { apiGet } from '@/lib/client/api-client';
import { formatDate } from '@/lib/utils';
import { IconAlert, IconExternal, IconScale, IconSearch } from '@/components/icons';
import { DatajudProcessCard } from './datajud-process-card';
import { ImportJurisprudenceForm } from './import-form';
import type { DatajudProcessDto } from './datajud-types';
import type { JurisprudenceRow } from './types';

/**
 * Busca jurídica: uma caixa só.
 *
 * O usuário digita o número do processo ou uma palavra-chave e recebe as duas
 * coisas de uma vez — os processos encontrados no CNJ e os entendimentos do
 * acervo. Antes eram duas abas, e quem pesquisava precisava saber de antemão
 * em qual base o que procurava estaria; agora a plataforma procura nas duas e
 * apenas diz de onde veio cada resultado.
 */

interface Entendimento extends JurisprudenceRow {
  score: number;
}

interface SearchResponse {
  query: string;
  byCaseNumber: boolean;
  processes: DatajudProcessDto[];
  processesTotal: number;
  processesError: string | null;
  index: string;
  datajudEnabled: boolean;
  entendimentos: Entendimento[];
  entendimentosError: string | null;
  courts: { value: string; label: string }[];
}

interface StatusResponse {
  status: { enabled: boolean; reason: string | null; index: string };
  courts: { value: string; label: string }[];
}

export function LegalSearchWorkspace({
  processes,
  canWrite,
  demoCount,
}: {
  processes: { id: string; number: string }[];
  canWrite: boolean;
  demoCount: number;
}) {
  const [query, setQuery] = useState('');
  const [court, setCourt] = useState('');
  const [includeDemo, setIncludeDemo] = useState(false);
  const [courts, setCourts] = useState<{ value: string; label: string }[]>([]);
  const [status, setStatus] = useState<StatusResponse['status'] | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await apiGet<StatusResponse>('/api/busca-juridica');
      if (response.ok) {
        setCourts(response.data.courts);
        setStatus(response.data.status);
      }
    })();
  }, []);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) {
      setError('Digite o número do processo ou uma palavra-chave.');
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ q, limit: '10' });
    if (court) params.set('court', court);
    if (includeDemo) params.set('includeDemo', 'true');

    const response = await apiGet<SearchResponse>(`/api/busca-juridica?${params.toString()}`);
    setLoading(false);

    if (!response.ok) {
      setError(response.message);
      setResult(null);
      return;
    }
    setResult(response.data);
  };

  const nada =
    result && result.processes.length === 0 && result.entendimentos.length === 0 && !loading;

  return (
    <div className="space-y-5">
      {error && <ErrorNotice>{error}</ErrorNotice>}

      <Card className="p-5">
        <form onSubmit={search} className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Número do processo ou palavra-chave — ex.: 5622661-02.2026.8.09.0000 ou cobrança indevida"
              className="input pl-9"
              aria-label="Busca jurídica"
            />
          </div>

          <Button type="submit" variant="primary" loading={loading}>
            Pesquisar
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[var(--text-subtle)]">
          <span>
            Procura ao mesmo tempo nos <strong>processos do CNJ</strong> e nos{' '}
            <strong>entendimentos do acervo</strong>.
          </span>

          {/* Opcional: com o número CNJ completo o tribunal sai do próprio número. */}
          <label className="flex items-center gap-2">
            <span>Tribunal:</span>
            <select
              value={court}
              onChange={(event) => setCourt(event.target.value)}
              className="input h-8 w-auto py-0 text-[12px]"
              aria-label="Tribunal"
            >
              <option value="">Detectar pelo número</option>
              {courts.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {demoCount > 0 && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={includeDemo}
                onChange={(event) => setIncludeDemo(event.target.checked)}
                className="size-3.5 accent-[var(--accent)]"
              />
              Incluir {demoCount} exemplo(s) fictício(s)
            </label>
          )}

          {canWrite && (
            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className="text-[var(--accent)] hover:underline"
            >
              {showImport ? 'Fechar' : 'Cadastrar entendimento'}
            </button>
          )}
        </div>
      </Card>

      {status && !status.enabled && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-dashed px-3.5 py-3 text-[12.5px] leading-relaxed"
          style={{ borderColor: 'var(--risk-medium)', color: 'var(--risk-medium)' }}
        >
          <IconAlert className="mt-px size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Consulta de processos desativada.</strong>{' '}
            {status.reason}. Defina <code className="font-mono text-[11.5px]">DATAJUD_ENABLED=true</code>{' '}
            e <code className="font-mono text-[11.5px]">DATAJUD_API_KEY</code> no{' '}
            <code className="font-mono text-[11.5px]">.env</code>. A busca por entendimentos no
            acervo continua funcionando.
          </span>
        </div>
      )}

      {showImport && canWrite && <ImportJurisprudenceForm onDone={() => setShowImport(false)} />}

      {loading && (
        <p className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <Spinner className="size-4" />
          Procurando nos processos do CNJ e no acervo…
        </p>
      )}

      {nada && (
        <Card>
          <EmptyState
            icon={<IconScale className="size-5" />}
            title="Nada encontrado para esta busca"
            description="Nem o CNJ nem o acervo retornaram resultados. Confira o número ou tente outros termos — a plataforma não preenche a tela com resultados inventados."
          />
        </Card>
      )}

      {result && !loading && (
        <>
          {/* ---- Processos (CNJ) ---------------------------------------- */}
          <section className="space-y-3">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-semibold">Processos</h2>
              <Badge tone="success">Fonte oficial · CNJ DataJud</Badge>
              <span className="text-[12.5px] text-[var(--text-muted)]">
                {result.processesError
                  ? 'não foi possível consultar'
                  : `${result.processesTotal} encontrado(s)`}
                {result.index && !result.processesError ? (
                  <>
                    {' '}
                    no índice <code className="font-mono text-[11.5px]">{result.index}</code>
                  </>
                ) : null}
              </span>
            </header>

            {result.processesError ? (
              <div
                className="rounded-lg px-3.5 py-3 text-[13px] leading-relaxed"
                style={{ background: 'var(--risk-critical-bg)', color: 'var(--risk-critical)' }}
              >
                {result.processesError}
              </div>
            ) : result.processes.length === 0 ? (
              <Card className="px-5 py-4">
                <p className="text-[13px] text-[var(--text-muted)]">
                  Nenhum processo com esse{' '}
                  {result.byCaseNumber ? 'número' : 'termo'} no índice consultado. Cada tribunal tem
                  o seu índice no CNJ — se o processo é de outro tribunal, selecione-o acima.
                </p>
              </Card>
            ) : (
              result.processes.map((item) => (
                <DatajudProcessCard key={item.id} item={item} processes={processes} />
              ))
            )}
          </section>

          {/* ---- Entendimentos (acervo) --------------------------------- */}
          <section className="space-y-3">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-semibold">Entendimentos</h2>
              <Badge>Acervo do escritório</Badge>
              <span className="text-[12.5px] text-[var(--text-muted)]">
                {result.entendimentosError
                  ? 'não foi possível consultar'
                  : `${result.entendimentos.length} encontrado(s)`}
              </span>
            </header>

            {result.entendimentosError ? (
              <ErrorNotice>{result.entendimentosError}</ErrorNotice>
            ) : result.entendimentos.length === 0 ? (
              <Card className="px-5 py-4">
                <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                  Nenhuma ementa do acervo corresponde a esta busca.{' '}
                  {canWrite
                    ? 'Use “Cadastrar entendimento” para incluir uma decisão com a URL do tribunal.'
                    : 'Peça a alguém com permissão de escrita para cadastrar as decisões relevantes.'}
                  <br />
                  <span className="text-[var(--text-subtle)]">
                    A API Pública do CNJ publica dados processuais, não ementas — por isso os
                    entendimentos vêm do acervo, e não do DataJud.
                  </span>
                </p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-[var(--border)]">
                  {result.entendimentos.map((item) => (
                    <EntendimentoItem key={item.id} item={item} />
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}

      {!result && !loading && (
        <InfoNotice>
          <strong>Como funciona.</strong> Digite o número do processo (com ou sem máscara) ou uma
          palavra-chave. A plataforma consulta a API Pública do CNJ para os dados do processo e as
          movimentações, e o acervo do escritório para os entendimentos. Os dois grupos aparecem
          separados por origem: um andamento processual não é precedente, e a plataforma não trata
          um como o outro.
        </InfoNotice>
      )}
    </div>
  );
}

function EntendimentoItem({ item }: { item: Entendimento }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] font-semibold">{item.court}</span>
        {item.judgingBody && (
          <span className="text-[12.5px] text-[var(--text-muted)]">{item.judgingBody}</span>
        )}
        <span className="font-mono text-[12px] text-[var(--text-subtle)]">{item.caseNumber}</span>
        {item.isDemo && <Badge tone="warning">Fictícia — demonstração</Badge>}
        {!item.isDemo && item.verified && <Badge tone="success">Fonte informada</Badge>}
        {typeof item.score === 'number' && (
          <span className="text-[11.5px] text-[var(--text-subtle)]">
            relevância {(item.score * 100).toFixed(0)}%
          </span>
        )}
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
        {item.summary.slice(0, 700)}
        {item.summary.length > 700 ? '…' : ''}
      </p>

      {item.thesis && (
        <p className="mt-2 border-l-2 border-[var(--accent)] pl-3 text-[13px] leading-relaxed">
          {item.thesis}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11.5px] text-[var(--text-subtle)]">
        {item.reporter && <span>Relator: {item.reporter}</span>}
        {item.judgmentDate && <span>Julgado em {formatDate(item.judgmentDate)}</span>}
        {item.outcome && <span>Resultado: {item.outcome}</span>}
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
          >
            <IconExternal className="size-3" />
            {item.sourceName}
          </a>
        )}
      </div>
    </li>
  );
}
