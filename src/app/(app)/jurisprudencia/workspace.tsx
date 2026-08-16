'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorNotice, Spinner } from '@/components/ui';
import { apiGet, apiPost } from '@/lib/client/api-client';
import { formatDate } from '@/lib/utils';
import { IconExternal, IconPlus, IconScale, IconSearch } from '@/components/icons';
import type { JurisprudenceRow } from './page';

interface Hit extends JurisprudenceRow {
  score: number;
}

export function JurisprudenceWorkspace({
  items,
  canWrite,
}: {
  items: JurisprudenceRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [court, setCourt] = useState('');
  const [results, setResults] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextQuery = query.trim();
    if (nextQuery.length === 0) {
      setResults(null);
      setError('Informe um termo ou número do processo para pesquisar.');
      return;
    }
    if (nextQuery.length < 3 && !/^\d{20}$/.test(nextQuery)) {
      setResults(null);
      setError('Use pelo menos 3 caracteres ou um número de processo CNJ de 20 dígitos.');
      return;
    }
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ q: nextQuery, limit: '20' });
    if (court) params.set('court', court);

    const response = await apiGet<{ results: Hit[] }>(`/api/jurisprudence?${params.toString()}`);
    setLoading(false);

    if (!response.ok) {
      setError(response.message);
      return;
    }
    setResults(response.data.results);
  };

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await apiPost('/api/jurisprudence', {
      court: String(form.get('court') ?? ''),
      judgingBody: String(form.get('judgingBody') ?? '') || null,
      caseNumber: String(form.get('caseNumber') ?? ''),
      judgmentDate: String(form.get('judgmentDate') ?? '') || null,
      reporter: String(form.get('reporter') ?? '') || null,
      summary: String(form.get('summary') ?? ''),
      thesis: String(form.get('thesis') ?? '') || null,
      outcome: String(form.get('outcome') ?? '') || null,
      excerpt: String(form.get('excerpt') ?? '') || null,
      sourceUrl: String(form.get('sourceUrl') ?? ''),
      sourceName: String(form.get('sourceName') ?? ''),
    });

    if (!response.ok) {
      setError(response.message);
      return;
    }
    setShowForm(false);
    router.refresh();
  };

  const shown: (JurisprudenceRow & { score?: number })[] = results ?? items;

  return (
    <div className="space-y-4">
      {error && <ErrorNotice>{error}</ErrorNotice>}

      <Card className="p-5">
        <form onSubmit={search} className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="00008323520184013202 ou cobrança indevida com dano moral"
              className="input pl-9"
            />
          </div>

          <label className="min-w-[180px]">
            <span className="sr-only">Tribunal</span>
            <select
              value={court}
              onChange={(event) => setCourt(event.target.value)}
              className="input"
              aria-label="Tribunal"
            >
              <option value="">Todos os tribunais</option>
              <option value="tjgo">TJGO</option>
              <option value="tjsp">TJSP</option>
              <option value="stj">STJ</option>
              <option value="tst">TST</option>
              <option value="tse">TSE</option>
              <option value="trf1">TRF1</option>
              <option value="trf2">TRF2</option>
              <option value="trf3">TRF3</option>
              <option value="trf4">TRF4</option>
            </select>
          </label>

          <Button type="submit" variant="primary" loading={loading}>
            Pesquisar
          </Button>
          {canWrite && (
            <Button type="button" onClick={() => setShowForm((value) => !value)}>
              <IconPlus className="size-3.5" />
              Importar
            </Button>
          )}
        </form>
        <p className="mt-2.5 text-[12px] text-[var(--text-subtle)]">
          Busca oficial do Datajud por tribunal e número de processo, combinada com o acervo interno do escritório. A plataforma só aceita fontes com URL verificável.
        </p>
      </Card>

      {showForm && canWrite && (
        <Card className="p-5">
          <h3 className="text-[15px] font-semibold">Importar decisão</h3>
          <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
            Cole a ementa e informe a URL oficial. A entrada é indexada para busca semântica.
          </p>

          <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field name="court" label="Tribunal *" required placeholder="TJGO" />
            <Field name="judgingBody" label="Órgão julgador" placeholder="3ª Câmara Cível" />
            <Field name="caseNumber" label="Número do processo *" required />
            <Field name="reporter" label="Relator" />
            <div>
              <label className="label" htmlFor="judgmentDate">
                Data do julgamento
              </label>
              <input id="judgmentDate" name="judgmentDate" type="date" className="input" />
            </div>
            <Field name="outcome" label="Resultado" placeholder="Provimento parcial" />

            <div className="sm:col-span-3">
              <label className="label" htmlFor="summary">
                Ementa *
              </label>
              <textarea id="summary" name="summary" required rows={4} className="input resize-y" />
            </div>

            <div className="sm:col-span-3">
              <label className="label" htmlFor="thesis">
                Tese firmada
              </label>
              <textarea id="thesis" name="thesis" rows={2} className="input resize-y" />
            </div>

            <div className="sm:col-span-2">
              <label className="label" htmlFor="sourceUrl">
                URL da fonte oficial *
              </label>
              <input
                id="sourceUrl"
                name="sourceUrl"
                type="url"
                required
                className="input"
                placeholder="https://..."
              />
            </div>
            <Field name="sourceName" label="Nome da fonte *" required placeholder="Portal do TJGO" />

            <div className="flex justify-end gap-2 sm:col-span-3">
              <Button type="button" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                Importar e indexar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading && (
        <p className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <Spinner className="size-4" />
          Consultando o acervo e, quando habilitado, a base oficial do Datajud…
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <p className="text-[13.5px] font-semibold">
            {results ? `${results.length} resultado(s) para a busca` : `Acervo (${items.length})`}
          </p>
        </div>

        {shown.length === 0 ? (
          <EmptyState
            icon={<IconScale className="size-5" />}
            title={results ? 'Nenhum resultado' : 'Acervo vazio'}
            description={
              results
                ? 'Nada no acervo corresponde a esta busca. A plataforma não inventa julgados para preencher o vazio.'
                : 'Importe decisões relevantes para o seu escritório. Cada entrada exige a URL da fonte oficial.'
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {shown.map((item) => (
              <li key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold">{item.court}</span>
                  {item.judgingBody && (
                    <span className="text-[12.5px] text-[var(--text-muted)]">{item.judgingBody}</span>
                  )}
                  <span className="font-mono text-[12px] text-[var(--text-subtle)]">
                    {item.caseNumber}
                  </span>
                  {item.isDemo && <Badge tone="warning">Fictícia — demonstração</Badge>}
                  {!item.isDemo && item.verified && <Badge tone="success">Fonte informada</Badge>}
                  {item.organizationId === null && <Badge>Acervo compartilhado</Badge>}
                  {item.score !== undefined && (
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
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} className="input" placeholder={placeholder} required={required} />
    </div>
  );
}
