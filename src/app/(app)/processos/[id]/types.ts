/** Tipos serializados que trafegam do servidor para o workspace do processo. */

export interface CitationDto {
  id: string;
  documentId: string | null;
  pageNumber: number | null;
  quote: string;
  document?: { title: string } | null;
}

export interface FindingDto {
  id: string;
  type: string;
  title: string;
  description: string;
  rationale: string | null;
  suggestion: string | null;
  severity: string;
  confidence: string;
  status: string;
  position: number;
  createdAt: string;
  citations: CitationDto[];
  analysis: { id: string; type: string; createdAt: string; provider: string | null; model: string | null } | null;
}

export interface AnalysisDto {
  id: string;
  type: string;
  confidence: string | null;
  summary: string | null;
  result: Record<string, unknown>;
  provider: string | null;
  model: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export interface DocumentDto {
  id: string;
  title: string;
  kind: string;
  status: string;
  pageCount: number;
  sizeBytes: number;
  mimeType: string;
  documentDate: string | null;
  createdAt: string;
  processingError: string | null;
  metadata: Record<string, unknown>;
}

export interface PartyDto {
  id: string;
  name: string;
  role: string;
  side: string;
  documentId: string | null;
  lawyerName: string | null;
  oabNumber: string | null;
}

export interface TimelineEventDto {
  id: string;
  occurredAt: string;
  type: string;
  title: string;
  description: string | null;
  importance: string;
  isInferred: boolean;
  documentId: string | null;
  pageNumber: number | null;
}

export interface DeadlineDto {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: string;
  priority: string;
  computed: boolean;
  computationNote: string | null;
  legalBasis: string | null;
  responsibleId: string | null;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeId: string | null;
}

export interface ClaimDto {
  id: string;
  kind: string;
  text: string;
  raisedBySide: string;
  evidenceStrength: string;
  strengthRationale: string | null;
}

export interface LegalIssueDto {
  id: string;
  title: string;
  description: string | null;
  isControversial: boolean;
}

export interface EvidenceDto {
  id: string;
  title: string;
  description: string | null;
  strength: string;
  supports: boolean;
  documentId: string | null;
  pageNumber: number | null;
  claimId: string | null;
}

export interface ProcessDto {
  id: string;
  number: string;
  court: string | null;
  district: string | null;
  courtUnit: string | null;
  procedureClass: string | null;
  subject: string | null;
  status: string;
  caseValueCents: string | null;
  notes: string | null;
  riskLevel: string;
  riskScore: number | null;
  riskRationale: string | null;
  executiveSummary: string | null;
  currentSituation: string | null;
  probableNextStep: string | null;
  lastAnalyzedAt: string | null;
  lastMovementAt: string | null;
  isDemo: boolean;
  client: { id: string; name: string; type: string; email: string | null } | null;
  responsible: { id: string; name: string; email: string; avatarColor: string } | null;
  parties: PartyDto[];
  documents: DocumentDto[];
  deadlines: DeadlineDto[];
  tasks: TaskDto[];
  timeline: TimelineEventDto[];
  claims: ClaimDto[];
  legalIssues: LegalIssueDto[];
  evidence: EvidenceDto[];
}

export interface WorkspacePermissions {
  canRunAnalysis: boolean;
  canUpload: boolean;
  canChat: boolean;
  canWrite: boolean;
  canReport: boolean;
  canTasks: boolean;
  canDeadlines: boolean;
}

export const TAB_KEYS = [
  'visao-geral',
  'linha-do-tempo',
  'partes',
  'documentos',
  'provas',
  'teses',
  'riscos',
  'estrategia',
  'jurisprudencia',
  'prazos',
  'tarefas',
  'chat',
] as const;

export type TabKey = (typeof TAB_KEYS)[number];

export const TAB_LABELS: Record<TabKey, string> = {
  'visao-geral': 'Visão geral',
  'linha-do-tempo': 'Linha do tempo',
  partes: 'Partes',
  documentos: 'Documentos',
  provas: 'Provas',
  teses: 'Teses e pedidos',
  riscos: 'Riscos',
  estrategia: 'Estratégia',
  jurisprudencia: 'Jurisprudência',
  prazos: 'Prazos',
  tarefas: 'Tarefas',
  chat: 'Chat',
};
