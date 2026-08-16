'use client';

import { Card, EmptyState, InfoNotice } from '@/components/ui';
import { CitationChip } from '@/components/evidence-viewer';
import { IconAlert, IconRefresh } from '@/components/icons';
import { FindingCard } from './finding-card';
import type { AnalysisDto, FindingDto } from '../types';

/**
 * Aba Riscos: reúne "como posso perder?" (vulnerabilidades e lacunas de prova)
 * e o detector de contradições, que exibe sempre os dois trechos em confronto.
 */
export function RisksPanel({
  findings,
  analyses,
  canTasks,
}: {
  findings: FindingDto[];
  analyses: Record<string, AnalysisDto>;
  canTasks: boolean;
}) {
  const vulnerabilities = findings.filter((f) => f.type === 'VULNERABILITY');
  const gaps = findings.filter((f) => f.type === 'EVIDENCE_GAP');
  const contradictions = findings.filter((f) => f.type === 'CONTRADICTION');

  const overall = (analyses.VULNERABILITIES?.result ?? {}) as { overallAssessment?: string };

  return (
    <div className="space-y-5">
      {overall.overallAssessment && <InfoNotice>{overall.overallAssessment}</InfoNotice>}

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold">
            <IconAlert className="size-4.5 text-[var(--risk-high)]" />
            Vulnerabilidades
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            Onde a nossa posição está frágil e o que a parte contrária pode explorar.
          </p>
        </div>

        {vulnerabilities.length === 0 ? (
          <EmptyState
            title="Nenhuma vulnerabilidade registrada"
            description='Use "Encontrar vulnerabilidades" na barra de inteligência para executar esta análise.'
          />
        ) : (
          <div>
            {vulnerabilities.map((finding) => (
              <FindingCard key={finding.id} finding={finding} canTasks={canTasks} />
            ))}
          </div>
        )}
      </Card>

      {gaps.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h3 className="text-[15px] font-semibold">Alegações sem prova localizada</h3>
            <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
              Estas alegações não têm documento correspondente entre os trechos indexados. Isso não
              significa que a prova não exista — significa que ela não está na plataforma.
            </p>
          </div>
          <div>
            {gaps.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                canTasks={canTasks}
                gapReason="Sem citação porque o achado é justamente a AUSÊNCIA de documento correspondente."
              />
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold">
            <IconRefresh className="size-4.5 text-[var(--risk-medium)]" />
            Contradições
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            Cada contradição mostra os dois trechos em confronto. Sem os dois lados verificáveis, o
            item não é exibido.
          </p>
        </div>

        {contradictions.length === 0 ? (
          <EmptyState
            title="Nenhuma contradição detectada"
            description='Execute "Encontrar contradições" para comparar datas, valores e versões dos fatos entre as peças.'
          />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {contradictions.map((finding) => (
              <ContradictionCard key={finding.id} finding={finding} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ContradictionCard({ finding }: { finding: FindingDto }) {
  const [sideA, sideB] = finding.citations;

  return (
    <article className="px-5 py-4">
      <h4 className="text-[14.5px] font-semibold leading-snug">{finding.title}</h4>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
        {finding.description}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {[sideA, sideB].map((citation, index) =>
          citation ? (
            <div
              key={citation.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5"
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                {index === 0 ? 'Trecho A' : 'Trecho B'} · {citation.document?.title ?? 'Documento'},
                página {citation.pageNumber}
              </p>
              <blockquote className="mt-2 border-l-2 border-[var(--border-strong)] pl-3 text-[12.5px] italic leading-relaxed text-[var(--text)]">
                “{citation.quote}”
              </blockquote>
              <div className="mt-2.5">
                <CitationChip citation={citation} />
              </div>
            </div>
          ) : null,
        )}
      </div>

      {finding.rationale && (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-subtle)]">
          {finding.rationale}
        </p>
      )}
    </article>
  );
}
