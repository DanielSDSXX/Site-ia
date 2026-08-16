'use client';

import { Card, EmptyState } from '@/components/ui';
import { CitationChip } from '@/components/evidence-viewer';
import { IconBrain } from '@/components/icons';
import type { AnalysisDto, FindingDto, ProcessDto } from '../types';

const STRENGTH_META: Record<string, { label: string; color: string; bg: string; width: string }> = {
  NONE: { label: 'Sem prova localizada', color: 'var(--risk-critical)', bg: 'var(--risk-critical-bg)', width: '4%' },
  WEAK: { label: 'Força probatória baixa', color: 'var(--risk-high)', bg: 'var(--risk-high-bg)', width: '33%' },
  MODERATE: { label: 'Força probatória média', color: 'var(--risk-medium)', bg: 'var(--risk-medium-bg)', width: '66%' },
  STRONG: { label: 'Força probatória alta', color: 'var(--risk-low)', bg: 'var(--risk-low-bg)', width: '100%' },
};

interface EvidenceMapResult {
  claims?: {
    text: string;
    kind: string;
    side: string;
    strength: string;
    strengthRationale: string;
    supporting?: { ref: string; note: string }[];
    contradicting?: { ref: string; note: string }[];
  }[];
  gaps?: { claim: string; note: string }[];
}

/**
 * Mapa de provas: ALEGAÇÃO → PROVAS → CONTRADIÇÕES → FORÇA PROBATÓRIA.
 *
 * A lista de lacunas responde diretamente à pergunta do briefing: "quais
 * alegações importantes ainda não possuem documentos suficientes?".
 */
export function EvidencePanel({
  process,
  analyses,
  findings,
}: {
  process: ProcessDto;
  analyses: Record<string, AnalysisDto>;
  findings: FindingDto[];
}) {
  const analysis = analyses.EVIDENCE_MAP;
  const result = (analysis?.result ?? {}) as EvidenceMapResult;
  const claims = result.claims ?? [];
  const gaps = result.gaps ?? [];

  // Citações resolvidas ficam nos Findings de lacuna; para as alegações
  // usamos os documentos do processo para resolver o ref exibido.
  const gapFindings = findings.filter((finding) => finding.type === 'EVIDENCE_GAP');

  if (claims.length === 0 && process.claims.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<IconBrain className="size-5" />}
          title="Mapa de provas não gerado"
          description='Execute "Mapa de provas" na barra de inteligência para ligar cada alegação às provas que a sustentam.'
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {gaps.length > 0 && (
        <Card className="overflow-hidden">
          <div
            className="border-b px-5 py-4"
            style={{ borderColor: 'var(--border)', background: 'var(--risk-critical-bg)' }}
          >
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--risk-critical)' }}>
              {gaps.length} alegação(ões) sem prova localizada
            </h3>
            <p className="mt-0.5 text-[13px]" style={{ color: 'var(--risk-critical)', opacity: 0.85 }}>
              Estas são as primeiras coisas que a parte contrária vai atacar.
            </p>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {gaps.map((gap, index) => (
              <li key={index} className="px-5 py-3.5">
                <p className="text-[13.5px] leading-relaxed">{gap.claim}</p>
                <p className="mt-1 text-[12px] text-[var(--text-subtle)]">{gap.note}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-[15px] font-semibold">Alegações e provas</h3>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            Cada alegação, os documentos que a sustentam e a força probatória estimada.
          </p>
        </div>

        <div className="divide-y divide-[var(--border)]">
          {(claims.length > 0
            ? claims
            : process.claims.map((claim) => ({
                text: claim.text,
                kind: claim.kind,
                side: claim.raisedBySide,
                strength: claim.evidenceStrength,
                strengthRationale: claim.strengthRationale ?? '',
                supporting: [],
                contradicting: [],
              }))
          ).map((claim, index) => {
            const meta = STRENGTH_META[claim.strength] ?? STRENGTH_META.NONE;
            return (
              <article key={index} className="px-5 py-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[var(--bg-subtle)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    {kindLabel(claim.kind)}
                  </span>
                  <span className="rounded bg-[var(--bg-subtle)] px-2 py-0.5 text-[10.5px] text-[var(--text-subtle)]">
                    {claim.side === 'OURS' ? 'Nossa' : claim.side === 'OPPOSING' ? 'Parte contrária' : 'Neutra'}
                  </span>
                </div>

                <p className="text-[13.5px] leading-relaxed">{claim.text}</p>

                <div className="mt-3 flex items-center gap-3">
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: meta.width, background: meta.color }}
                    />
                  </div>
                  <span className="text-[11.5px] font-medium" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                </div>

                {claim.strengthRationale && (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-subtle)]">
                    {claim.strengthRationale}
                  </p>
                )}

                {(claim.supporting?.length ?? 0) > 0 && (
                  <div className="mt-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      Provas que sustentam
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {claim.supporting!.map((item, i) => (
                        <li key={i} className="text-[12.5px] text-[var(--text-muted)]">
                          · {item.note || item.ref}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(claim.contradicting?.length ?? 0) > 0 && (
                  <div className="mt-3">
                    <p
                      className="text-[10.5px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--risk-critical)' }}
                    >
                      Elementos que contradizem
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {claim.contradicting!.map((item, i) => (
                        <li key={i} className="text-[12.5px] text-[var(--text-muted)]">
                          · {item.note || item.ref}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </Card>

      {gapFindings.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h3 className="text-[15px] font-semibold">Provas registradas com fonte</h3>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {gapFindings
              .filter((finding) => finding.citations.length > 0)
              .map((finding) => (
                <li key={finding.id} className="px-5 py-3.5">
                  <p className="text-[13.5px]">{finding.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {finding.citations.map((citation) => (
                      <CitationChip key={citation.id} citation={citation} />
                    ))}
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    FACT: 'Fato',
    ALLEGATION: 'Alegação',
    REQUEST: 'Pedido',
    THESIS: 'Tese',
    DEFENSE: 'Defesa',
  };
  return map[kind] ?? kind;
}
