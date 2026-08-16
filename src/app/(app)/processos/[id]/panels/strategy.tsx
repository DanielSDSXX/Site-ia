'use client';

import { Card, EmptyState, InfoNotice } from '@/components/ui';
import { IconScale, IconSwords, IconTarget, IconUsers } from '@/components/icons';
import { FindingCard } from './finding-card';
import type { AnalysisDto, FindingDto } from '../types';

/**
 * Aba Estratégia: próxima ação, simulação do adversário, contra-argumentos,
 * simulação analítica e explicação para o cliente.
 */
export function StrategyPanel({
  findings,
  analyses,
  canTasks,
}: {
  findings: FindingDto[];
  analyses: Record<string, AnalysisDto>;
  canTasks: boolean;
}) {
  const actions = findings.filter((f) => f.type === 'STRATEGIC_ACTION');
  const opponent = findings.filter((f) => f.type === 'ADVERSARIAL_ARGUMENT');
  const counters = findings.filter((f) => f.type === 'COUNTER_ARGUMENT');
  const plaintiff = findings.filter((f) => f.type === 'TRIAL_POINT_PLAINTIFF');
  const defendant = findings.filter((f) => f.type === 'TRIAL_POINT_DEFENDANT');
  const issues = findings.filter((f) => f.type === 'CONTROVERSIAL_ISSUE');

  const adversarial = (analyses.ADVERSARIAL?.result ?? {}) as { likelyQuestions?: string[] };
  const trial = (analyses.TRIAL_SIMULATION?.result ?? {}) as {
    decisiveEvidence?: { text: string }[];
    clarificationsNeeded?: string[];
  };
  const clientExplanation = (analyses.CLIENT_EXPLANATION?.result ?? {}) as {
    text?: string;
    glossary?: { term: string; meaning: string }[];
  };

  return (
    <div className="space-y-5">
      {/* --------------------------------------------------------- Próxima ação */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold">
            <IconTarget className="size-4.5 text-[var(--accent)]" />
            O que fazer agora
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            Providências sugeridas em ordem de prioridade. A plataforma não pratica atos — toda ação
            externa depende da sua revisão.
          </p>
        </div>

        {actions.length === 0 ? (
          <EmptyState
            title="Nenhuma ação sugerida ainda"
            description='Use o botão "Próxima ação" na barra de inteligência.'
          />
        ) : (
          <div>
            {actions.map((finding) => (
              <FindingCard key={finding.id} finding={finding} canTasks={canTasks} />
            ))}
          </div>
        )}
      </Card>

      {/* ----------------------------------------------------------- Adversário */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold">
            <IconSwords className="size-4.5 text-[var(--risk-high)]" />
            Perspectiva da parte contrária
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            O que o adversário provavelmente sustentaria — e como isso poderia ser enfrentado.
          </p>
        </div>

        {opponent.length === 0 && counters.length === 0 ? (
          <EmptyState
            title="Simulação não executada"
            description='Use "Simular adversário" para mapear os ataques prováveis à nossa tese.'
          />
        ) : (
          <div className="grid gap-px bg-[var(--border)] lg:grid-cols-2">
            <div className="bg-[var(--surface)]">
              <p className="border-b border-[var(--border)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--risk-high)]">
                Argumentos do adversário
              </p>
              {opponent.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-[var(--text-subtle)]">Nenhum registrado.</p>
              ) : (
                opponent.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} canTasks={canTasks} />
                ))
              )}
            </div>

            <div className="bg-[var(--surface)]">
              <p className="border-b border-[var(--border)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--risk-low)]">
                Como rebater
              </p>
              {counters.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-[var(--text-subtle)]">Nenhum registrado.</p>
              ) : (
                counters.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} canTasks={canTasks} />
                ))
              )}
            </div>
          </div>
        )}

        {adversarial.likelyQuestions && adversarial.likelyQuestions.length > 0 && (
          <div className="border-t border-[var(--border)] px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Perguntas incômodas que podem surgir
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {adversarial.likelyQuestions.map((question, index) => (
                <li key={index} className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                  · {question}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* --------------------------------------------------- Simulação analítica */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold">
            <IconScale className="size-4.5 text-[var(--text-muted)]" />
            Simulação analítica
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            Organiza o material decisório dos dois lados. Deliberadamente não indica um resultado
            provável do julgamento.
          </p>
        </div>

        {plaintiff.length === 0 && defendant.length === 0 && issues.length === 0 ? (
          <EmptyState
            title="Simulação não executada"
            description='Use "Simulação analítica" para separar o que pesa para cada lado.'
          />
        ) : (
          <>
            <div className="grid gap-px bg-[var(--border)] lg:grid-cols-2">
              <TrialColumn title="Pontos favoráveis ao autor" findings={plaintiff} />
              <TrialColumn title="Pontos favoráveis ao réu" findings={defendant} />
            </div>

            {issues.length > 0 && (
              <div className="border-t border-[var(--border)]">
                <p className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Questões controvertidas
                </p>
                {issues.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} canTasks={canTasks} />
                ))}
              </div>
            )}

            {trial.decisiveEvidence && trial.decisiveEvidence.length > 0 && (
              <div className="border-t border-[var(--border)] px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Provas tendencialmente decisivas
                </p>
                <ul className="mt-2.5 space-y-1.5">
                  {trial.decisiveEvidence.map((item, index) => (
                    <li key={index} className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                      · {item.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {trial.clarificationsNeeded && trial.clarificationsNeeded.length > 0 && (
              <div className="border-t border-[var(--border)] px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Pontos que precisam de esclarecimento
                </p>
                <ul className="mt-2.5 space-y-1.5">
                  {trial.clarificationsNeeded.map((item, index) => (
                    <li key={index} className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ------------------------------------------------ Explicação ao cliente */}
      {clientExplanation.text && (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <IconUsers className="size-4.5 text-[var(--text-muted)]" />
              Explicação para o cliente
            </h3>
            <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
              A mesma situação, em linguagem simples. Revise antes de enviar.
            </p>
          </div>
          <div className="p-5">
            <p className="prose-legal whitespace-pre-line">{clientExplanation.text}</p>

            {clientExplanation.glossary && clientExplanation.glossary.length > 0 && (
              <dl className="mt-5 grid gap-2.5 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
                {clientExplanation.glossary.map((entry) => (
                  <div key={entry.term} className="text-[12.5px]">
                    <dt className="font-medium">{entry.term}</dt>
                    <dd className="text-[var(--text-muted)]">{entry.meaning}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-5">
              <InfoNotice>
                Este texto é uma minuta. Nenhum conteúdo é enviado ao cliente automaticamente — a
                revisão humana é obrigatória antes de qualquer comunicação externa.
              </InfoNotice>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function TrialColumn({ title, findings }: { title: string; findings: FindingDto[] }) {
  return (
    <div className="bg-[var(--surface)]">
      <p className="border-b border-[var(--border)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        {title}
      </p>
      {findings.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-[var(--text-subtle)]">Nenhum ponto registrado.</p>
      ) : (
        findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)
      )}
    </div>
  );
}
