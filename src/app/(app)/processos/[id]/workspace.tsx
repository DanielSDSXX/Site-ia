'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { cn, formatCurrencyCents, formatDate, relativeTime } from '@/lib/utils';
import { Badge, Card, DemoNotice, RiskBadge } from '@/components/ui';
import { EvidenceViewerProvider } from '@/components/evidence-viewer';
import { apiGet } from '@/lib/client/api-client';
import { TAB_KEYS, TAB_LABELS, type ProcessDto, type FindingDto, type AnalysisDto, type TabKey, type WorkspacePermissions } from './types';
import { IntelligenceBar } from './panels/intelligence-bar';
import { OverviewPanel } from './panels/overview';
import { TimelinePanel } from './panels/timeline';
import { DocumentsPanel } from './panels/documents';
import { RisksPanel } from './panels/risks';
import { StrategyPanel } from './panels/strategy';
import { EvidencePanel } from './panels/evidence';
import { ClaimsPanel } from './panels/claims';
import { PartiesPanel } from './panels/parties';
import { ChatPanel } from './panels/chat';
import { DeadlinesPanel } from './panels/deadlines';
import { TasksPanel } from './panels/tasks';
import { JurisprudencePanel } from './panels/jurisprudence';
import { ProcessingBanner } from './panels/processing-banner';

interface Props {
  process: ProcessDto;
  findings: FindingDto[];
  analyses: Record<string, AnalysisDto>;
  members: { id: string; name: string }[];
  permissions: WorkspacePermissions;
  demoAI: boolean;
}

export function ProcessWorkspace({ process, findings, analyses, members, permissions, demoAI }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const tabParam = params.get('aba') as TabKey | null;
  const activeTab: TabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'visao-geral';

  const [busy, setBusy] = useState(false);

  const setTab = (tab: TabKey) => {
    const next = new URLSearchParams(params.toString());
    next.set('aba', tab);
    router.replace(`/processos/${process.id}?${next.toString()}`, { scroll: false });
  };

  /**
   * Enquanto houver documento em processamento ou análise em execução,
   * consultamos o status e atualizamos a página quando tudo terminar.
   */
  const pollStatus = useCallback(async () => {
    const response = await apiGet<{ idle: boolean }>(`/api/processes/${process.id}/status`);
    if (response.ok && response.data.idle) {
      setBusy(false);
      router.refresh();
      return true;
    }
    return false;
  }, [process.id, router]);

  useEffect(() => {
    const pending = process.documents.some((doc) => doc.status !== 'INDEXED' && doc.status !== 'FAILED');
    if (!pending) return;

    setBusy(true);
    const timer = setInterval(() => {
      void pollStatus().then((done) => {
        if (done) clearInterval(timer);
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [process.documents, pollStatus]);

  const findingsByType = (type: string) => findings.filter((finding) => finding.type === type);

  const counters: Partial<Record<TabKey, number>> = {
    documentos: process.documents.length,
    riscos: findingsByType('VULNERABILITY').length + findingsByType('CONTRADICTION').length + findingsByType('EVIDENCE_GAP').length,
    estrategia: findingsByType('STRATEGIC_ACTION').length + findingsByType('ADVERSARIAL_ARGUMENT').length,
    prazos: process.deadlines.filter((d) => d.status === 'OPEN').length,
    tarefas: process.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELED').length,
    'linha-do-tempo': process.timeline.length,
    partes: process.parties.length,
    provas: process.claims.length,
    teses: process.legalIssues.length,
  };

  return (
    <EvidenceViewerProvider>
      {/* ------------------------------------------------------------ Cabeçalho */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[20px] font-semibold tracking-tight">{process.number}</h1>
            <RiskBadge level={process.riskLevel as never} score={process.riskScore} />
            <Badge>{process.status === 'ACTIVE' ? 'Ativo' : process.status}</Badge>
            {process.isDemo && <Badge tone="warning">Dados de demonstração</Badge>}
          </div>

          <p className="mt-1.5 text-[13.5px] text-[var(--text-muted)]">
            {[
              process.subject,
              process.court,
              process.courtUnit,
              process.client?.name ? `Cliente: ${process.client.name}` : null,
              process.caseValueCents
                ? `Valor: ${formatCurrencyCents(Number(process.caseValueCents))}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Sem informações complementares cadastradas.'}
          </p>

          <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
            {process.lastAnalyzedAt
              ? `Última análise ${relativeTime(process.lastAnalyzedAt)}`
              : 'Nenhuma análise executada ainda'}
            {process.lastMovementAt
              ? ` · Última movimentação identificada em ${formatDate(process.lastMovementAt)}`
              : ''}
          </p>
        </div>
      </header>

      {demoAI && (
        <div className="mt-4">
          <DemoNotice />
        </div>
      )}

      <ProcessingBanner processId={process.id} documents={process.documents} active={busy} />

      {/* ---------------------------------------------------- Ações de inteligência */}
      {permissions.canRunAnalysis && (
        <div className="mt-5">
          <IntelligenceBar
            processId={process.id}
            hasDocuments={process.documents.some((doc) => doc.status === 'INDEXED')}
            onStarted={() => setBusy(true)}
            onFinished={() => {
              setBusy(false);
              router.refresh();
            }}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ Abas */}
      <div className="mt-6 overflow-x-auto border-b border-[var(--border)]">
        <nav className="flex min-w-max gap-0.5" role="tablist">
          {TAB_KEYS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setTab(tab)}
              className={cn(
                'relative whitespace-nowrap px-3.5 py-2.5 text-[13.5px] transition-colors',
                activeTab === tab
                  ? 'font-medium text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              )}
            >
              {TAB_LABELS[tab]}
              {counters[tab] !== undefined && counters[tab]! > 0 && (
                <span className="ml-1.5 rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-subtle)]">
                  {counters[tab]}
                </span>
              )}
              {activeTab === tab && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'visao-geral' && (
          <OverviewPanel
            process={process}
            findings={findings}
            analyses={analyses}
            onNavigate={setTab}
          />
        )}
        {activeTab === 'linha-do-tempo' && <TimelinePanel process={process} />}
        {activeTab === 'partes' && <PartiesPanel process={process} />}
        {activeTab === 'documentos' && (
          <DocumentsPanel process={process} canUpload={permissions.canUpload} />
        )}
        {activeTab === 'provas' && <EvidencePanel process={process} analyses={analyses} findings={findings} />}
        {activeTab === 'teses' && <ClaimsPanel process={process} />}
        {activeTab === 'riscos' && <RisksPanel findings={findings} analyses={analyses} canTasks={permissions.canTasks} />}
        {activeTab === 'estrategia' && (
          <StrategyPanel findings={findings} analyses={analyses} canTasks={permissions.canTasks} />
        )}
        {activeTab === 'jurisprudencia' && <JurisprudencePanel process={process} />}
        {activeTab === 'prazos' && (
          <DeadlinesPanel process={process} members={members} canWrite={permissions.canDeadlines} />
        )}
        {activeTab === 'tarefas' && (
          <TasksPanel process={process} members={members} canWrite={permissions.canTasks} />
        )}
        {activeTab === 'chat' && (
          <ChatPanel processId={process.id} enabled={permissions.canChat} demoAI={demoAI} />
        )}
      </div>
    </EvidenceViewerProvider>
  );
}

export function PanelCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}
