'use client';

import { Card, EmptyState, RiskBadge, InfoNotice, Badge } from '@/components/ui';
import { CitationList } from '@/components/evidence-viewer';
import { formatDate, relativeTime } from '@/lib/utils';
import { IconAlert, IconBrain, IconChevronRight, IconTarget, IconTimeline } from '@/components/icons';
import type { AnalysisDto, FindingDto, ProcessDto, TabKey } from '../types';

interface SummaryResult {
  executiveSummary?: string;
  currentSituation?: string;
  probableNextStep?: string;
  riskRationale?: string;
  keyPoints?: { text: string; refs: string[] }[];
  _meta?: { demo?: boolean; provider?: string; model?: string; generatedAt?: string };
}

export function OverviewPanel({
  process,
  findings,
  analyses,
  onNavigate,
}: {
  process: ProcessDto;
  findings: FindingDto[];
  analyses: Record<string, AnalysisDto>;
  onNavigate: (tab: TabKey) => void;
}) {
  const summaryAnalysis = analyses.PROCESS_SUMMARY;
  const summary = (summaryAnalysis?.result ?? {}) as SummaryResult;

  const topActions = findings
    .filter((finding) => finding.type === 'STRATEGIC_ACTION')
    .slice(0, 3);
  const topRisks = findings
    .filter((finding) => finding.type === 'VULNERABILITY' || finding.type === 'EVIDENCE_GAP')
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, 3);

  const hasAnalysis = Boolean(process.executiveSummary || summary.executiveSummary);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {/* ------------------------------------------------ Resumo executivo */}
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h3 className="text-[15px] font-semibold">Resumo executivo</h3>
            {summaryAnalysis?.completedAt && (
              <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">
                Gerado {relativeTime(summaryAnalysis.completedAt)}
                {summaryAnalysis.provider ? ` · ${summaryAnalysis.provider}` : ''}
                {summaryAnalysis.model ? ` (${summaryAnalysis.model})` : ''}
              </p>
            )}
          </div>

          <div className="p-5">
            {hasAnalysis ? (
              <>
                <p className="prose-legal">{process.executiveSummary ?? summary.executiveSummary}</p>

                {summary.keyPoints && summary.keyPoints.length > 0 && (
                  <ul className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
                    {summary.keyPoints.map((point, index) => (
                      <li key={index}>
                        <p className="text-[13.5px] leading-relaxed">{point.text}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {summaryAnalysis && (
                  <CitationsFromAnalysis analysisId={summaryAnalysis.id} findings={findings} />
                )}
              </>
            ) : (
              <EmptyState
                icon={<IconBrain className="size-5" />}
                title="Nenhuma análise executada ainda"
                description={
                  process.documents.length === 0
                    ? 'Envie as peças do processo na aba Documentos. A análise inicial roda automaticamente após a indexação.'
                    : 'Use os botões de inteligência acima para gerar o resumo, a linha do tempo e os riscos.'
                }
              />
            )}
          </div>
        </Card>

        {/* --------------------------------------------------- Situação atual */}
        {hasAnalysis && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Card className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Situação atual
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed">
                {process.currentSituation ?? summary.currentSituation ?? 'Não disponível.'}
              </p>
            </Card>

            <Card className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Próximo passo provável
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed">
                {process.probableNextStep ?? summary.probableNextStep ?? 'Não disponível.'}
              </p>
              <p className="mt-3 text-[11.5px] italic text-[var(--text-subtle)]">
                Expectativa baseada na fase processual identificada nos documentos. Não é previsão
                de decisão.
              </p>
            </Card>
          </div>
        )}

        {/* --------------------------------------------------- Ações e riscos */}
        {topActions.length > 0 && (
          <Card className="overflow-hidden">
            <button
              type="button"
              onClick={() => onNavigate('estrategia')}
              className="flex w-full items-center justify-between border-b border-[var(--border)] px-5 py-4 text-left transition-colors hover:bg-[var(--bg-subtle)]"
            >
              <span className="flex items-center gap-2.5">
                <IconTarget className="size-4.5 text-[var(--accent)]" />
                <span className="text-[15px] font-semibold">O que fazer agora</span>
              </span>
              <IconChevronRight className="size-4 text-[var(--text-subtle)]" />
            </button>
            <ol className="divide-y divide-[var(--border)]">
              {topActions.map((action, index) => (
                <li key={action.id} className="flex gap-3.5 px-5 py-3.5">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] font-mono text-[11px] font-semibold text-[var(--accent)]">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium">{action.title}</p>
                    <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                      {action.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {topRisks.length > 0 && (
          <Card className="overflow-hidden">
            <button
              type="button"
              onClick={() => onNavigate('riscos')}
              className="flex w-full items-center justify-between border-b border-[var(--border)] px-5 py-4 text-left transition-colors hover:bg-[var(--bg-subtle)]"
            >
              <span className="flex items-center gap-2.5">
                <IconAlert className="size-4.5 text-[var(--risk-high)]" />
                <span className="text-[15px] font-semibold">Onde você pode perder</span>
              </span>
              <IconChevronRight className="size-4 text-[var(--text-subtle)]" />
            </button>
            <ul className="divide-y divide-[var(--border)]">
              {topRisks.map((risk) => (
                <li key={risk.id} className="px-5 py-3.5">
                  <p className="text-[13.5px] font-medium">{risk.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                    {risk.description}
                  </p>
                  <CitationList citations={risk.citations.slice(0, 2)} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* -------------------------------------------------------- Coluna lateral */}
      <div className="space-y-5">
        <Card className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Avaliação de risco
          </p>
          <div className="mt-3">
            <RiskBadge level={process.riskLevel as never} score={process.riskScore} />
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            {process.riskRationale ??
              summary.riskRationale ??
              'Execute a análise do processo para estimar o risco.'}
          </p>
          {process.riskScore !== null && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${process.riskScore}%`,
                    background:
                      process.riskScore >= 75
                        ? 'var(--risk-critical)'
                        : process.riskScore >= 55
                          ? 'var(--risk-high)'
                          : process.riskScore >= 35
                            ? 'var(--risk-medium)'
                            : 'var(--risk-low)',
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--text-subtle)]">
                Índice estrutural de risco (0–100). Não representa probabilidade de derrota.
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Identificação
          </p>
          <dl className="mt-3 space-y-2.5 text-[13px]">
            <Row label="Tribunal" value={process.court} />
            <Row label="Comarca" value={process.district} />
            <Row label="Vara" value={process.courtUnit} />
            <Row label="Classe" value={process.procedureClass} />
            <Row label="Cliente" value={process.client?.name ?? null} />
            <Row label="Responsável" value={process.responsible?.name ?? null} />
          </dl>
        </Card>

        {process.parties.length > 0 && (
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Partes
            </p>
            <ul className="mt-3 space-y-2.5">
              {process.parties.slice(0, 6).map((party) => (
                <li key={party.id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-[13px]">{party.name}</span>
                  <Badge tone={party.side === 'OURS' ? 'accent' : 'neutral'}>
                    {party.side === 'OURS' ? 'Nosso' : party.side === 'OPPOSING' ? 'Contrário' : '—'}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {process.timeline.length > 0 && (
          <Card className="overflow-hidden">
            <button
              type="button"
              onClick={() => onNavigate('linha-do-tempo')}
              className="flex w-full items-center justify-between border-b border-[var(--border)] px-5 py-3.5 text-left transition-colors hover:bg-[var(--bg-subtle)]"
            >
              <span className="flex items-center gap-2">
                <IconTimeline className="size-4 text-[var(--text-muted)]" />
                <span className="text-[13.5px] font-semibold">Últimos eventos</span>
              </span>
              <IconChevronRight className="size-4 text-[var(--text-subtle)]" />
            </button>
            <ul className="divide-y divide-[var(--border)]">
              {process.timeline.slice(-4).reverse().map((event) => (
                <li key={event.id} className="px-5 py-3">
                  <p className="text-[12px] text-[var(--text-subtle)]">{formatDate(event.occurredAt)}</p>
                  <p className="mt-0.5 text-[13px] font-medium">{event.type}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {process.documents.length === 0 && (
          <InfoNotice>
            Sem documentos, a plataforma não tem o que analisar. Envie a petição inicial e a
            contestação para obter o primeiro diagnóstico útil.
          </InfoNotice>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--text-subtle)]">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value ?? '—'}</dd>
    </div>
  );
}

function CitationsFromAnalysis({
  analysisId,
  findings,
}: {
  analysisId: string;
  findings: FindingDto[];
}) {
  const citations = findings
    .filter((finding) => finding.analysis?.id === analysisId)
    .flatMap((finding) => finding.citations)
    .slice(0, 6);

  if (citations.length === 0) return null;
  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        Fontes utilizadas
      </p>
      <CitationList citations={citations} />
    </div>
  );
}

function severityWeight(severity: string): number {
  return severity === 'HIGH' ? 3 : severity === 'MEDIUM' ? 2 : 1;
}
