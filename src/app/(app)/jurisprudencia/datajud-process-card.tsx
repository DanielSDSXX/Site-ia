'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, ErrorNotice } from '@/components/ui';
import { apiPost } from '@/lib/client/api-client';
import { formatDate, formatDateTime } from '@/lib/utils';
import { IconAlert, IconTimeline } from '@/components/icons';
import type { DatajudProcessDto, SituationCode } from './datajud-types';

/**
 * Ficha de um processo consultado no CNJ.
 *
 * A tela é organizada em quatro blocos, do mais confiável ao mais interpretado:
 *
 *  1. identificação e sigilo — dados publicados pelo CNJ, exibidos como vieram;
 *  2. situação — DEDUZIDA das movimentações, sempre com o andamento que a
 *     sustenta ao lado, para o advogado poder discordar da leitura;
 *  3. partes — cadastro do próprio escritório, porque a API Pública não
 *     publica nome de parte;
 *  4. movimentações — o registro oficial, que alimenta a linha do tempo.
 */

const SITUATION_TONE: Record<SituationCode, { color: string; background: string }> = {
  ATIVO: { color: 'var(--risk-low)', background: 'var(--risk-low-bg)' },
  SUSPENSO: { color: 'var(--risk-medium)', background: 'var(--risk-medium-bg)' },
  ARQUIVADO: { color: 'var(--text-muted)', background: 'var(--bg-subtle)' },
  BAIXADO: { color: 'var(--text-muted)', background: 'var(--bg-subtle)' },
  INDEFINIDO: { color: 'var(--text-subtle)', background: 'var(--bg-subtle)' },
};

export function DatajudProcessCard({
  item,
  processes,
}: {
  item: DatajudProcessDto;
  processes: { id: string; number: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState('');
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const suggested = processes.find(
    (process) => process.number.replace(/\D/g, '') === item.caseNumberDigits,
  );

  useEffect(() => {
    if (suggested && !target) setTarget(suggested.id);
  }, [suggested, target]);

  const runImport = async () => {
    if (!target) return;
    setImporting(true);
    setFeedback(null);
    setImportError(null);

    const response = await apiPost<{
      imported: number;
      skipped: number;
      statusChanged: string | null;
    }>('/api/datajud', {
      processId: target,
      caseNumber: item.caseNumberDigits ?? item.caseNumber,
      court: item.index,
    });

    setImporting(false);
    if (!response.ok) {
      setImportError(response.message);
      return;
    }

    const { imported, skipped, statusChanged } = response.data;
    setFeedback(
      [
        `${imported} movimentação(ões) importada(s) para a linha do tempo`,
        skipped > 0 ? `${skipped} já existia(m) ou vieram sem data.` : '.',
        statusChanged ? `Situação do processo atualizada para ${statusChanged}.` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
  };

  const tone = SITUATION_TONE[item.situation.code];

  return (
    <Card className="overflow-hidden">
      {/* 1. Identificação ---------------------------------------------- */}
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[14px] font-semibold">{item.caseNumber}</span>
          <Badge tone="success">Fonte oficial · CNJ DataJud</Badge>
          <Badge>{item.court}</Badge>
          {item.degree && <Badge>{item.degree}</Badge>}
        </div>

        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          <Row label="Classe" value={item.procedureClass} />
          <Row label="Órgão julgador" value={item.judgingBody} />
          <Row label="Assuntos" value={item.subjects.join(', ') || null} />
          <Row
            label="Sistema"
            value={[item.system, item.format].filter(Boolean).join(' · ') || null}
          />
          <Row label="Ajuizamento" value={item.filedAt ? formatDate(item.filedAt) : null} />
          <Row
            label="Última atualização"
            value={item.lastUpdateAt ? formatDateTime(item.lastUpdateAt) : null}
          />
        </dl>
      </div>

      {/* Segredo de justiça: aviso, não apenas um selo discreto ---------- */}
      {item.secrecy.isSecret && (
        <div
          className="flex items-start gap-2.5 border-b border-[var(--border)] px-5 py-3.5 text-[12.5px] leading-relaxed"
          style={{ background: 'var(--risk-critical-bg)', color: 'var(--risk-critical)' }}
        >
          <IconAlert className="mt-px size-4 shrink-0" />
          <span>
            <strong className="font-semibold">{item.secrecy.label}.</strong> Este processo tramita
            sob sigilo. O CNJ restringe o que publica nesses casos, então os dados acima podem estar
            incompletos — e o conteúdo não deve ser compartilhado fora das pessoas autorizadas nos
            autos.
          </span>
        </div>
      )}

      {/* 2. Situação ----------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] px-5 py-3.5">
        <span className="text-[12.5px] text-[var(--text-subtle)]">Situação:</span>
        <span
          className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
          style={{ color: tone.color, background: tone.background }}
        >
          {item.situation.label}
        </span>

        {item.situation.basis ? (
          <span className="text-[12px] text-[var(--text-muted)]">
            deduzida de “{item.situation.basis.name}”
            {item.situation.basis.occurredAt
              ? ` em ${formatDate(item.situation.basis.occurredAt)}`
              : ''}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--text-muted)]">
            sem movimentação que permita concluir
          </span>
        )}

        <span className="ml-auto text-[11.5px] text-[var(--text-subtle)]">
          A API do CNJ não publica um campo de situação — este rótulo é leitura das movimentações.
        </span>
      </div>

      {/* 3. Partes ------------------------------------------------------- */}
      <div className="border-b border-[var(--border)] px-5 py-3.5">
        <p className="text-[12.5px] text-[var(--text-subtle)]">
          Partes
          {item.local ? ' — cadastro do escritório' : ''}
        </p>

        {item.local && item.local.parties.length > 0 ? (
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {item.local.parties.map((party, index) => (
              <li key={`${party.name}-${index}`} className="flex flex-wrap items-center gap-2">
                <span className="text-[13px]">{party.name}</span>
                <span className="text-[11.5px] text-[var(--text-subtle)]">{party.role}</span>
                {party.side === 'OURS' && <Badge tone="success">Nosso cliente</Badge>}
                {party.side === 'OPPOSING' && <Badge tone="warning">Parte contrária</Badge>}
                {party.lawyerName && (
                  <span className="text-[11.5px] text-[var(--text-subtle)]">
                    adv. {party.lawyerName}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            A API Pública do CNJ <strong>não publica o nome das partes</strong> — nem em processos
            públicos. {item.local
              ? 'Este processo está cadastrado no escritório, mas ainda sem partes registradas: cadastre-as na ficha do processo.'
              : 'Cadastre o processo no escritório com as partes para vê-las aqui ao lado dos dados oficiais.'}
          </p>
        )}
      </div>

      {/* 4. Movimentações ------------------------------------------------ */}
      <div className="border-b border-[var(--border)] px-5 py-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--accent)] hover:underline"
        >
          <IconTimeline className="size-4" />
          {item.movements.length} movimentação(ões) {expanded ? '— ocultar' : '— ver'}
        </button>

        {expanded && (
          <ol className="mt-3 space-y-2.5 border-l border-[var(--border)] pl-4">
            {item.movements.length === 0 && (
              <li className="text-[13px] text-[var(--text-subtle)]">
                Este processo não trouxe movimentações no índice consultado.
              </li>
            )}
            {item.movements
              .slice()
              .reverse()
              .map((movement, index) => (
                <li key={`${movement.code}-${index}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-[var(--border-strong)]" />
                  <p className="font-mono text-[11.5px] text-[var(--text-subtle)]">
                    {movement.occurredAt ? formatDateTime(movement.occurredAt) : 'sem data'}
                    {movement.code ? ` · código ${movement.code}` : ''}
                  </p>
                  <p className="text-[13px]">{movement.name}</p>
                  {movement.complements.length > 0 && (
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {movement.complements.join(' · ')}
                    </p>
                  )}
                  {/* Só vale mostrar quando o ato saiu de outra vara. */}
                  {movement.judgingBody && movement.judgingBody !== item.judgingBody && (
                    <p className="text-[11.5px] text-[var(--text-subtle)]">{movement.judgingBody}</p>
                  )}
                </li>
              ))}
          </ol>
        )}
      </div>

      {/* Importação ------------------------------------------------------ */}
      <div className="px-5 py-3.5">
        {importError && (
          <div className="mb-3">
            <ErrorNotice>{importError}</ErrorNotice>
          </div>
        )}

        {feedback ? (
          <p className="text-[13px]" style={{ color: 'var(--risk-low)' }}>
            {feedback}
          </p>
        ) : processes.length === 0 ? (
          <p className="text-[12.5px] text-[var(--text-subtle)]">
            Cadastre um processo no escritório para poder importar estas movimentações.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-[var(--text-muted)]">
              Importar movimentações para:
            </span>
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="input w-auto min-w-[240px] text-[12.5px]"
              aria-label="Processo de destino"
            >
              <option value="">Selecione o processo</option>
              {processes.map((process) => (
                <option key={process.id} value={process.id}>
                  {process.number}
                  {process.id === suggested?.id ? ' (mesmo número)' : ''}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={runImport} loading={importing} disabled={!target}>
              Importar para a linha do tempo
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-[var(--text-subtle)]">{label}:</dt>
      <dd className="min-w-0">{value ?? '—'}</dd>
    </div>
  );
}
