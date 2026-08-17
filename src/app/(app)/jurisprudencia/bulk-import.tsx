'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Badge, Button, Card, ErrorNotice } from '@/components/ui';
import { apiPost } from '@/lib/client/api-client';
import { IconAlert, IconPlus } from '@/components/icons';

/**
 * Importação de ementas em lote.
 *
 * O fluxo é sempre em dois passos — conferir, depois gravar. A prévia (`dryRun`)
 * mostra quantas linhas entram, quantas já existem e quais são recusadas, com o
 * número da linha e o motivo. Importar 40 de 50 sem dizer quais 10 ficaram de
 * fora seria pior do que não importar.
 */

interface RowError {
  line: number;
  field: string | null;
  message: string;
}

interface Report {
  totalRows: number;
  valid: number;
  imported: number;
  duplicates: number;
  errors: RowError[];
  unknownHeaders: string[];
  missingColumns: string[];
  preview: { line: number; court: string; caseNumber: string; summary: string }[];
}

const COLUNA_LABEL: Record<string, string> = {
  court: 'Tribunal',
  caseNumber: 'Número do processo',
  summary: 'Ementa',
  sourceUrl: 'URL da fonte',
  sourceName: 'Nome da fonte',
};

const MODELO = [
  'Tribunal\tÓrgão julgador\tNúmero do processo\tData\tRelator\tEmenta\tTese\tResultado\tURL\tFonte',
  'TJGO\t3ª Câmara Cível\t0801234-56.2026.8.09.0051\t11/03/2026\tDes. Fulano\tCole aqui a ementa completa\tTese firmada\tProvimento parcial\thttps://tjgo.jus.br/exemplo\tPortal do TJGO',
].join('\n');

export function BulkImportPanel({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (dryRun: boolean) => {
    if (!text.trim()) {
      setError('Cole a planilha ou selecione um arquivo CSV.');
      return;
    }
    setLoading(true);
    setError(null);

    const response = await apiPost<Report>('/api/jurisprudence/bulk', { text, dryRun });
    setLoading(false);

    if (!response.ok) {
      setError(response.message);
      return;
    }

    setReport(response.data);
    if (!dryRun) {
      setConfirmed(true);
      router.refresh();
    }
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    setReport(null);
    setConfirmed(false);
  };

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold">Importar ementas em lote</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
        Cole a planilha (copiada do Excel ou do Google Sheets) ou envie um arquivo CSV. Cada linha
        vira um entendimento pesquisável. <strong>URL e nome da fonte são obrigatórios</strong> em
        toda linha — é a regra que impede o acervo de receber decisão não conferível.
      </p>

      {error && (
        <div className="mt-3">
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          onChange={onFile}
          className="hidden"
        />
        <Button type="button" size="sm" onClick={() => fileRef.current?.click()}>
          Selecionar arquivo CSV
        </Button>
        <button
          type="button"
          onClick={() => {
            setText(MODELO);
            setReport(null);
            setConfirmed(false);
          }}
          className="text-[12.5px] text-[var(--accent)] hover:underline"
        >
          Preencher com o modelo de colunas
        </button>
      </div>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setReport(null);
          setConfirmed(false);
        }}
        rows={8}
        spellCheck={false}
        placeholder={
          'Cole aqui, com a primeira linha sendo o cabeçalho.\n\nTribunal\tNúmero do processo\tEmenta\tURL\tFonte'
        }
        className="input mt-3 resize-y font-mono text-[12px] leading-relaxed"
        aria-label="Planilha de ementas"
      />

      <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--text-subtle)]">
        Colunas reconhecidas: tribunal, órgão julgador, número do processo, data, relator, ementa,
        tese, resultado, trecho, URL e fonte. Nomes em português ou inglês, com ou sem acento.
      </p>

      {/* --- Prévia -------------------------------------------------------- */}
      {report && (
        <div className="mt-4 rounded-lg border border-[var(--border)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold">
              {confirmed ? 'Importação concluída' : 'Prévia — nada foi gravado ainda'}
            </span>
            <Badge tone="success">{confirmed ? report.imported : report.valid} entram</Badge>
            {report.duplicates > 0 && <Badge>{report.duplicates} já no acervo</Badge>}
            {report.errors.length > 0 && (
              <Badge tone="warning">{report.errors.length} problema(s)</Badge>
            )}
            <span className="text-[12px] text-[var(--text-subtle)]">
              {report.totalRows} linha(s) lida(s)
            </span>
          </div>

          {report.missingColumns.length > 0 && (
            <div
              className="mt-3 flex items-start gap-2 rounded-md px-3 py-2.5 text-[12.5px] leading-relaxed"
              style={{ background: 'var(--risk-critical-bg)', color: 'var(--risk-critical)' }}
            >
              <IconAlert className="mt-px size-4 shrink-0" />
              <span>
                Faltam colunas obrigatórias:{' '}
                <strong>
                  {report.missingColumns.map((c) => COLUNA_LABEL[c] ?? c).join(', ')}
                </strong>
                . Confira o cabeçalho da primeira linha.
              </span>
            </div>
          )}

          {report.unknownHeaders.length > 0 && (
            <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
              Colunas ignoradas (não reconhecidas): {report.unknownHeaders.join(', ')}.
            </p>
          )}

          {report.preview.length > 0 && !confirmed && (
            <ul className="mt-3 space-y-1.5">
              {report.preview.map((row) => (
                <li key={row.line} className="text-[12.5px]">
                  <span className="font-mono text-[11.5px] text-[var(--text-subtle)]">
                    linha {row.line}
                  </span>{' '}
                  <strong>{row.court}</strong>{' '}
                  <span className="font-mono text-[11.5px]">{row.caseNumber}</span>
                  <span className="text-[var(--text-muted)]"> — {row.summary}…</span>
                </li>
              ))}
              {report.valid > report.preview.length && (
                <li className="text-[12px] text-[var(--text-subtle)]">
                  e mais {report.valid - report.preview.length} linha(s).
                </li>
              )}
            </ul>
          )}

          {report.errors.length > 0 && (
            <div className="mt-3">
              <p className="text-[12.5px] font-medium">Linhas recusadas</p>
              <ul className="mt-1.5 space-y-1">
                {report.errors.slice(0, 12).map((err, index) => (
                  <li key={`${err.line}-${index}`} className="text-[12px] text-[var(--text-muted)]">
                    <span className="font-mono text-[11.5px] text-[var(--text-subtle)]">
                      linha {err.line}
                    </span>{' '}
                    {err.field ? <strong>{COLUNA_LABEL[err.field] ?? err.field}: </strong> : null}
                    {err.message}
                  </li>
                ))}
                {report.errors.length > 12 && (
                  <li className="text-[12px] text-[var(--text-subtle)]">
                    e mais {report.errors.length - 12} problema(s).
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" onClick={onDone}>
          {confirmed ? 'Fechar' : 'Cancelar'}
        </Button>

        {!confirmed && (
          <>
            <Button type="button" onClick={() => run(true)} loading={loading} disabled={!text.trim()}>
              Conferir
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => run(false)}
              loading={loading}
              disabled={!report || report.valid === 0}
            >
              <IconPlus className="size-3.5" />
              Importar {report ? `${report.valid} ementa(s)` : ''}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
