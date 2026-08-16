import {
  AIOperation,
  AnalysisStatus,
  AnalysisType,
  Confidence,
  FindingType,
  RiskLevel,
  Severity,
  NotificationKind,
  type Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { aiProvider, parseJsonResponse } from '@/lib/ai';
import { recordAIUsage } from '@/lib/ai/usage';
import { buildContext, type BuiltContext } from '@/lib/rag/context';
import { retrieve, retrieveProcessOverview, type RetrievedChunk } from '@/lib/rag/retriever';
import { AppError, logError } from '@/lib/errors';
import { PROMPTS } from './prompts';
import { resolveRefs, type ResolvedCitation, adjustConfidence, quoteAppearsInChunk } from './grounding';
import {
  heuristicAdversarial,
  heuristicClientExplanation,
  heuristicContradictions,
  heuristicEvidenceMap,
  heuristicNextActions,
  heuristicRisk,
  heuristicStructure,
  heuristicSummary,
  heuristicTimeline,
  heuristicTrialSimulation,
  heuristicVulnerabilities,
  type HeuristicInput,
  type HeuristicProcessInfo,
} from './heuristics';
import {
  adversarialSchema,
  clientExplanationSchema,
  contradictionsSchema,
  evidenceMapSchema,
  nextActionsSchema,
  structureSchema,
  summarySchema,
  timelineSchema,
  trialSimulationSchema,
  vulnerabilitiesSchema,
  type AnalysisMeta,
} from './types';

/**
 * Orquestrador das análises.
 *
 * Fluxo único para todos os tipos:
 *   recuperar contexto -> gerar (LLM ou motor heurístico) -> validar refs ->
 *   persistir análise + achados + citações -> registrar consumo.
 *
 * A validação de refs acontece SEMPRE, inclusive no caminho heurístico. Assim
 * nenhuma citação chega à interface sem um chunk real por trás.
 */

const ANALYSIS_OPERATION: Record<AnalysisType, AIOperation> = {
  PROCESS_SUMMARY: AIOperation.SUMMARY,
  TIMELINE: AIOperation.SUMMARY,
  VULNERABILITIES: AIOperation.VULNERABILITIES,
  ADVERSARIAL: AIOperation.ADVERSARIAL,
  TRIAL_SIMULATION: AIOperation.TRIAL_SIMULATION,
  CONTRADICTIONS: AIOperation.CONTRADICTIONS,
  NEXT_ACTIONS: AIOperation.NEXT_ACTIONS,
  EVIDENCE_MAP: AIOperation.EVIDENCE_MAP,
  CLIENT_EXPLANATION: AIOperation.CLIENT_EXPLANATION,
  STRUCTURE_EXTRACTION: AIOperation.STRUCTURE_EXTRACTION,
};

export const ANALYSIS_LABELS: Record<AnalysisType, string> = {
  PROCESS_SUMMARY: 'Resumo executivo',
  TIMELINE: 'Linha do tempo',
  VULNERABILITIES: 'Vulnerabilidades',
  ADVERSARIAL: 'Simulação do adversário',
  TRIAL_SIMULATION: 'Simulação analítica',
  CONTRADICTIONS: 'Contradições',
  NEXT_ACTIONS: 'Próximas ações',
  EVIDENCE_MAP: 'Mapa de provas',
  CLIENT_EXPLANATION: 'Explicação para o cliente',
  STRUCTURE_EXTRACTION: 'Estrutura do processo',
};

/** Consultas usadas para recuperar contexto direcionado por tipo de análise. */
const RETRIEVAL_QUERIES: Partial<Record<AnalysisType, string>> = {
  VULNERABILITIES:
    'ônus da prova ausência de prova preliminar prescrição decadência ilegitimidade preclusão impugnação contradição documento não juntado',
  ADVERSARIAL: 'contestação impugnação preliminar defesa alegações do réu improcedência argumentos contrários',
  CONTRADICTIONS: 'valor data prazo contrato pagamento cobrança divergência versão dos fatos',
  NEXT_ACTIONS: 'prazo intimação decisão determinação manifestação providência pendência',
  EVIDENCE_MAP: 'documento anexo comprovante prova alega requer demonstra fatura extrato',
  TRIAL_SIMULATION: 'fatos provas fundamentos pedidos controvérsia decisão',
};

export interface RunAnalysisOptions {
  organizationId: string;
  processId: string;
  type: AnalysisType;
  userId?: string | null;
  /** Contexto adicional livre fornecido pelo usuário. */
  instructions?: string;
}

export interface RunAnalysisResult {
  analysisId: string;
  demo: boolean;
  confidence: Confidence;
  citationsCount: number;
  droppedRefs: string[];
}

export async function runAnalysis(options: RunAnalysisOptions): Promise<RunAnalysisResult> {
  const { organizationId, processId, type } = options;

  const process = await prisma.process.findFirst({
    where: { id: processId, organizationId, deletedAt: null },
    include: {
      parties: true,
      deadlines: { where: { status: 'OPEN' }, select: { title: true, dueDate: true } },
      documents: {
        where: { deletedAt: null },
        select: { id: true, kind: true, status: true, documentDate: true, metadata: true },
      },
    },
  });
  if (!process) throw new AppError('Processo não encontrado.', { status: 404, code: 'not_found', expose: true });

  const analysis = await prisma.aIAnalysis.create({
    data: {
      organizationId,
      processId,
      requestedById: options.userId ?? null,
      type,
      status: AnalysisStatus.RUNNING,
      startedAt: new Date(),
    },
  });

  const started = Date.now();

  try {
    // ---- 1. Contexto ----------------------------------------------------
    const chunks = await gatherChunks(organizationId, processId, type, options.instructions);
    const context = buildContext(chunks);

    const processInfo: HeuristicProcessInfo = {
      number: process.number,
      subject: process.subject,
      court: process.court,
      status: process.status,
      ourSideName: process.parties.find((p) => p.side === 'OURS')?.name ?? null,
      opposingSideName: process.parties.find((p) => p.side === 'OPPOSING')?.name ?? null,
      documentKinds: [...new Set(process.documents.map((d) => d.kind))],
      documentCount: process.documents.length,
      pagesWithoutText: process.documents.reduce((sum, d) => {
        const meta = d.metadata as { pagesWithoutText?: number } | null;
        return sum + (meta?.pagesWithoutText ?? 0);
      }, 0),
      openDeadlines: process.deadlines,
      lastDocumentDate:
        process.documents
          .map((d) => d.documentDate)
          .filter((d): d is Date => Boolean(d))
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    };

    if (context.blocks.length === 0 && type !== 'NEXT_ACTIONS') {
      throw new AppError(
        'Este processo ainda não tem documentos indexados. Envie as peças antes de executar a análise.',
        { status: 409, code: 'no_documents', expose: true },
      );
    }

    // ---- 2. Geração -----------------------------------------------------
    const provider = aiProvider();
    const heuristicInput: HeuristicInput = { process: processInfo, context };

    let payload: Record<string, unknown>;
    let inputTokens = 0;
    let outputTokens = 0;
    let model = provider.defaultModel;
    let providerName = provider.name;

    if (provider.isDemo) {
      payload = runHeuristic(type, heuristicInput);
      model = 'local-extractive-v1';
      providerName = 'local';
    } else {
      const prompt = promptFor(type);
      const userMessage = buildUserMessage(processInfo, context, options.instructions);
      const response = await provider.complete({
        system: prompt,
        messages: [{ role: 'user', content: userMessage }],
        json: true,
        maxTokens: 6000,
        temperature: 0.15,
      });

      const parsed = parseJsonResponse<Record<string, unknown>>(response.text);
      if (!parsed) {
        throw new AppError(
          'O provedor de IA respondeu num formato inesperado. A análise não foi concluída.',
          { status: 502, code: 'ai_bad_format', expose: true },
        );
      }
      payload = parsed;
      inputTokens = response.inputTokens;
      outputTokens = response.outputTokens;
      model = response.model;
      providerName = response.provider;
    }

    // ---- 3. Validação e persistência -------------------------------------
    const validated = validatePayload(type, payload);
    const persisted = await persistAnalysis({
      analysisId: analysis.id,
      organizationId,
      processId,
      type,
      payload: validated,
      context,
      demo: provider.isDemo,
      provider: providerName,
      model,
    });

    await prisma.aIAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: AnalysisStatus.COMPLETED,
        completedAt: new Date(),
        durationMs: Date.now() - started,
        confidence: persisted.confidence,
        summary: persisted.summary,
        provider: providerName,
        model,
        chunkIdsUsed: context.chunkIds,
        result: {
          ...(validated as object),
          _meta: {
            demo: provider.isDemo,
            provider: providerName,
            model,
            chunkIdsUsed: context.chunkIds,
            droppedRefs: persisted.droppedRefs,
            contextTruncated: context.truncated,
            generatedAt: new Date().toISOString(),
          } satisfies AnalysisMeta,
        } as Prisma.InputJsonValue,
      },
    });

    await recordAIUsage({
      organizationId,
      userId: options.userId,
      processId,
      operation: ANALYSIS_OPERATION[type],
      provider: providerName,
      model,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - started,
    });

    await applySideEffects(type, organizationId, processId, validated, options.userId ?? null);

    return {
      analysisId: analysis.id,
      demo: provider.isDemo,
      confidence: persisted.confidence,
      citationsCount: persisted.citationsCount,
      droppedRefs: persisted.droppedRefs,
    };
  } catch (err) {
    await prisma.aIAnalysis
      .update({
        where: { id: analysis.id },
        data: {
          status: AnalysisStatus.FAILED,
          completedAt: new Date(),
          durationMs: Date.now() - started,
          error: err instanceof Error ? err.message.slice(0, 500) : 'Erro desconhecido',
        },
      })
      .catch(() => undefined);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Recuperação
// ---------------------------------------------------------------------------

async function gatherChunks(
  organizationId: string,
  processId: string,
  type: AnalysisType,
  instructions?: string,
): Promise<RetrievedChunk[]> {
  const overview = await retrieveProcessOverview(organizationId, processId, 45);

  const query = [RETRIEVAL_QUERIES[type], instructions].filter(Boolean).join(' ');
  if (!query) return overview;

  const targeted = await retrieve({ organizationId, processId, query, limit: 25 });

  const merged = new Map<string, RetrievedChunk>();
  for (const chunk of [...targeted, ...overview]) {
    if (!merged.has(chunk.id)) merged.set(chunk.id, chunk);
  }
  return [...merged.values()].slice(0, 70);
}

function buildUserMessage(
  process: HeuristicProcessInfo,
  context: BuiltContext,
  instructions?: string,
): string {
  const header = [
    `PROCESSO: ${process.number}`,
    process.subject ? `ASSUNTO: ${process.subject}` : null,
    process.court ? `TRIBUNAL: ${process.court}` : null,
    process.ourSideName ? `NOSSO CLIENTE: ${process.ourSideName}` : 'NOSSO CLIENTE: não informado no cadastro',
    process.opposingSideName ? `PARTE CONTRÁRIA: ${process.opposingSideName}` : null,
    process.openDeadlines.length > 0
      ? `PRAZOS EM ABERTO: ${process.openDeadlines
          .map((d) => `${d.title} (${d.dueDate.toLocaleDateString('pt-BR')})`)
          .join('; ')}`
      : null,
    process.pagesWithoutText > 0
      ? `ATENÇÃO: ${process.pagesWithoutText} página(s) dos autos não têm texto extraído e NÃO estão no contexto abaixo.`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const extra = instructions ? `\n\nORIENTAÇÃO ADICIONAL DO ADVOGADO:\n${instructions.slice(0, 2000)}` : '';
  const truncationNote = context.truncated
    ? '\n\nATENÇÃO: o contexto foi truncado por limite de tamanho. Não conclua nada sobre o que não está aqui.'
    : '';

  return `${header}\n\n${context.text}${extra}${truncationNote}`;
}

function promptFor(type: AnalysisType): string {
  switch (type) {
    case 'PROCESS_SUMMARY': return PROMPTS.summary;
    case 'TIMELINE': return PROMPTS.timeline;
    case 'VULNERABILITIES': return PROMPTS.vulnerabilities;
    case 'ADVERSARIAL': return PROMPTS.adversarial;
    case 'TRIAL_SIMULATION': return PROMPTS.trialSimulation;
    case 'CONTRADICTIONS': return PROMPTS.contradictions;
    case 'NEXT_ACTIONS': return PROMPTS.nextActions;
    case 'EVIDENCE_MAP': return PROMPTS.evidenceMap;
    case 'CLIENT_EXPLANATION': return PROMPTS.clientExplanation;
    case 'STRUCTURE_EXTRACTION': return PROMPTS.structure;
  }
}

function runHeuristic(type: AnalysisType, input: HeuristicInput): Record<string, unknown> {
  switch (type) {
    case 'PROCESS_SUMMARY': return heuristicSummary(input) as unknown as Record<string, unknown>;
    case 'TIMELINE': return heuristicTimeline(input) as unknown as Record<string, unknown>;
    case 'VULNERABILITIES': return heuristicVulnerabilities(input) as unknown as Record<string, unknown>;
    case 'ADVERSARIAL': return heuristicAdversarial(input) as unknown as Record<string, unknown>;
    case 'TRIAL_SIMULATION': return heuristicTrialSimulation(input) as unknown as Record<string, unknown>;
    case 'CONTRADICTIONS': return heuristicContradictions(input) as unknown as Record<string, unknown>;
    case 'NEXT_ACTIONS': return heuristicNextActions(input) as unknown as Record<string, unknown>;
    case 'EVIDENCE_MAP': return heuristicEvidenceMap(input) as unknown as Record<string, unknown>;
    case 'STRUCTURE_EXTRACTION': return heuristicStructure(input) as unknown as Record<string, unknown>;
    case 'CLIENT_EXPLANATION':
      return heuristicClientExplanation(input, heuristicSummary(input)) as unknown as Record<string, unknown>;
  }
}

function validatePayload(type: AnalysisType, payload: Record<string, unknown>): Record<string, unknown> {
  const schema = {
    PROCESS_SUMMARY: summarySchema,
    TIMELINE: timelineSchema,
    VULNERABILITIES: vulnerabilitiesSchema,
    ADVERSARIAL: adversarialSchema,
    TRIAL_SIMULATION: trialSimulationSchema,
    CONTRADICTIONS: contradictionsSchema,
    NEXT_ACTIONS: nextActionsSchema,
    EVIDENCE_MAP: evidenceMapSchema,
    CLIENT_EXPLANATION: clientExplanationSchema,
    STRUCTURE_EXTRACTION: structureSchema,
  }[type];

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new AppError('A análise retornou um resultado fora do formato esperado e foi descartada.', {
      status: 502,
      code: 'ai_schema_mismatch',
      expose: true,
      details: result.error.issues.slice(0, 5),
    });
  }
  return result.data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Persistência de achados e citações
// ---------------------------------------------------------------------------

interface PersistInput {
  analysisId: string;
  organizationId: string;
  processId: string;
  type: AnalysisType;
  payload: Record<string, unknown>;
  context: BuiltContext;
  demo: boolean;
  provider: string;
  model: string;
}

interface PersistResult {
  confidence: Confidence;
  summary: string;
  citationsCount: number;
  droppedRefs: string[];
}

async function persistAnalysis(input: PersistInput): Promise<PersistResult> {
  const droppedRefs: string[] = [];
  let citationsCount = 0;

  // Uma nova execução SUBSTITUI a anterior do mesmo tipo.
  //
  // A interface sempre mostra a análise mais recente de cada tipo; sem esta
  // limpeza, reexecutar "Encontrar vulnerabilidades" empilharia os mesmos
  // achados e o contador do processo cresceria sem parar. O registro em
  // `ai_analyses` é preservado — o que sai são os achados órfãos da execução
  // anterior (as citações caem junto, por cascade).
  await prisma.finding.deleteMany({
    where: {
      processId: input.processId,
      organizationId: input.organizationId,
      analysisId: { not: input.analysisId },
      analysis: { type: input.type },
    },
  });

  const createFinding = async (
    type: FindingType,
    finding: {
      title: string;
      description: string;
      rationale?: string | null;
      suggestion?: string | null;
      severity?: 'LOW' | 'MEDIUM' | 'HIGH';
      confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
      refs?: string[];
    },
    position: number,
  ) => {
    const { valid, dropped } = resolveRefs(finding.refs ?? [], input.context);
    droppedRefs.push(...dropped);

    const confidence = adjustConfidence(finding.confidence ?? 'MEDIUM', valid, dropped.length);

    const created = await prisma.finding.create({
      data: {
        organizationId: input.organizationId,
        processId: input.processId,
        analysisId: input.analysisId,
        type,
        title: finding.title.slice(0, 200),
        description: finding.description,
        rationale: finding.rationale ?? null,
        suggestion: finding.suggestion ?? null,
        severity: (finding.severity ?? 'MEDIUM') as Severity,
        confidence: confidence as Confidence,
        position,
      },
    });

    await createCitations(valid, input, { findingId: created.id });
    citationsCount += valid.length;
  };

  switch (input.type) {
    case 'VULNERABILITIES': {
      const data = input.payload as { findings: Parameters<typeof createFinding>[1][] };
      for (const [index, finding] of data.findings.entries()) {
        await createFinding(FindingType.VULNERABILITY, finding, index);
      }
      break;
    }
    case 'ADVERSARIAL': {
      const data = input.payload as {
        opponentArguments: Parameters<typeof createFinding>[1][];
        counterArguments: Parameters<typeof createFinding>[1][];
      };
      for (const [index, finding] of data.opponentArguments.entries()) {
        await createFinding(FindingType.ADVERSARIAL_ARGUMENT, finding, index);
      }
      for (const [index, finding] of data.counterArguments.entries()) {
        await createFinding(FindingType.COUNTER_ARGUMENT, finding, index);
      }
      break;
    }
    case 'TRIAL_SIMULATION': {
      const data = input.payload as {
        plaintiffPoints: Parameters<typeof createFinding>[1][];
        defendantPoints: Parameters<typeof createFinding>[1][];
        controversialIssues: Parameters<typeof createFinding>[1][];
      };
      for (const [index, finding] of data.plaintiffPoints.entries()) {
        await createFinding(FindingType.TRIAL_POINT_PLAINTIFF, finding, index);
      }
      for (const [index, finding] of data.defendantPoints.entries()) {
        await createFinding(FindingType.TRIAL_POINT_DEFENDANT, finding, index);
      }
      for (const [index, finding] of data.controversialIssues.entries()) {
        await createFinding(FindingType.CONTROVERSIAL_ISSUE, finding, index);
      }
      break;
    }
    case 'CONTRADICTIONS': {
      const data = input.payload as {
        contradictions: {
          title: string;
          description: string;
          severity: 'LOW' | 'MEDIUM' | 'HIGH';
          confidence: 'LOW' | 'MEDIUM' | 'HIGH';
          sideA: { ref: string; quote: string };
          sideB: { ref: string; quote: string };
        }[];
      };

      for (const [index, contradiction] of data.contradictions.entries()) {
        const { valid, dropped } = resolveRefs(
          [contradiction.sideA.ref, contradiction.sideB.ref],
          input.context,
        );
        droppedRefs.push(...dropped);

        // Uma contradição sem os dois lados verificáveis não é exibível.
        if (valid.length < 2) continue;

        const quotesChecked = [contradiction.sideA, contradiction.sideB].every((side) => {
          const chunk = input.context.byRef.get(side.ref);
          return chunk ? quoteAppearsInChunk(side.quote, chunk.content) : false;
        });

        const created = await prisma.finding.create({
          data: {
            organizationId: input.organizationId,
            processId: input.processId,
            analysisId: input.analysisId,
            type: FindingType.CONTRADICTION,
            title: contradiction.title.slice(0, 200),
            description: contradiction.description,
            rationale: quotesChecked
              ? 'As duas citações foram conferidas contra o texto original dos documentos.'
              : 'Atenção: ao menos uma das citações não foi encontrada literalmente no trecho de origem. Confira manualmente antes de usar.',
            severity: contradiction.severity as Severity,
            confidence: (quotesChecked ? contradiction.confidence : 'LOW') as Confidence,
            position: index,
          },
        });

        await createCitations(
          valid.map((citation) => ({
            ...citation,
            quote:
              citation.ref === contradiction.sideA.ref ? contradiction.sideA.quote : contradiction.sideB.quote,
          })),
          input,
          { findingId: created.id },
        );
        citationsCount += valid.length;
      }
      break;
    }
    case 'NEXT_ACTIONS': {
      const data = input.payload as {
        actions: { title: string; description: string; rationale?: string | null; priority: string; refs: string[] }[];
      };
      for (const [index, action] of data.actions.entries()) {
        await createFinding(
          FindingType.STRATEGIC_ACTION,
          {
            title: action.title,
            description: action.description,
            rationale: action.rationale,
            severity: action.priority === 'URGENT' ? 'HIGH' : action.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
            refs: action.refs,
          },
          index,
        );
      }
      break;
    }
    case 'EVIDENCE_MAP': {
      const data = input.payload as {
        gaps: { claim: string; note: string }[];
      };
      for (const [index, gap] of data.gaps.entries()) {
        await createFinding(
          FindingType.EVIDENCE_GAP,
          {
            // O título carrega um recorte da alegação: numa lista de sete
            // lacunas, títulos idênticos obrigariam a abrir cada uma para
            // saber do que se trata.
            title: `Sem prova: ${shortClaimLabel(gap.claim)}`,
            description: gap.claim,
            rationale: gap.note,
            severity: 'HIGH',
            confidence: 'MEDIUM',
            refs: [],
          },
          index,
        );
      }
      break;
    }
    default:
      // Resumo, timeline, estrutura e explicação não geram Findings;
      // suas citações são resolvidas abaixo.
      break;
  }

  // Citações de nível de análise (resumo/timeline/estrutura).
  const analysisRefs = collectAnalysisRefs(input.type, input.payload);
  if (analysisRefs.length > 0) {
    const { valid, dropped } = resolveRefs(analysisRefs, input.context);
    droppedRefs.push(...dropped);
    await createCitations(valid, input, { analysisId: input.analysisId });
    citationsCount += valid.length;
  }

  const declared = (input.payload.confidence as 'LOW' | 'MEDIUM' | 'HIGH' | undefined) ?? 'MEDIUM';
  const confidence = input.demo
    ? Confidence.LOW
    : (adjustConfidence(declared, citationsCount > 0 ? [{} as ResolvedCitation] : [], droppedRefs.length) as Confidence);

  return {
    confidence,
    summary: summarize(input.type, input.payload),
    citationsCount,
    droppedRefs: [...new Set(droppedRefs)],
  };
}

async function createCitations(
  citations: ResolvedCitation[],
  input: PersistInput,
  link: { findingId?: string; analysisId?: string },
) {
  if (citations.length === 0) return;
  await prisma.citation.createMany({
    data: citations.map((citation) => ({
      organizationId: input.organizationId,
      documentId: citation.documentId,
      pageId: citation.pageId,
      chunkId: citation.chunkId,
      pageNumber: citation.pageNumber,
      quote: citation.quote,
      relevance: citation.relevance,
      findingId: link.findingId ?? null,
      analysisId: link.analysisId ?? input.analysisId,
    })),
  });
}

function collectAnalysisRefs(type: AnalysisType, payload: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) refs.push(...value.filter((v): v is string => typeof v === 'string'));
  };

  if (type === 'PROCESS_SUMMARY') {
    for (const point of (payload.keyPoints as { refs?: string[] }[]) ?? []) push(point.refs);
  }
  if (type === 'TIMELINE') {
    for (const event of (payload.events as { refs?: string[] }[]) ?? []) push(event.refs);
  }
  if (type === 'STRUCTURE_EXTRACTION') {
    for (const key of ['parties', 'claims', 'legalIssues']) {
      for (const item of (payload[key] as { refs?: string[] }[]) ?? []) push(item.refs);
    }
  }
  if (type === 'EVIDENCE_MAP') {
    for (const claim of (payload.claims as { supporting?: { ref: string }[] }[]) ?? []) {
      refs.push(...(claim.supporting ?? []).map((s) => s.ref));
    }
  }
  return [...new Set(refs)];
}

/** Recorte curto de uma alegação, para distinguir achados numa lista. */
function shortClaimLabel(text: string, max = 90): string {
  const clean = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a autora|o autor|a r[ée]|o r[ée]u|a parte autora|a parte r[ée])\s+/i, '');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function summarize(type: AnalysisType, payload: Record<string, unknown>): string {
  switch (type) {
    case 'PROCESS_SUMMARY':
      return String(payload.executiveSummary ?? '').slice(0, 500);
    case 'VULNERABILITIES':
      return `${((payload.findings as unknown[]) ?? []).length} vulnerabilidade(s) identificada(s).`;
    case 'ADVERSARIAL':
      return `${((payload.opponentArguments as unknown[]) ?? []).length} argumento(s) adversarial(is) mapeado(s).`;
    case 'CONTRADICTIONS':
      return `${((payload.contradictions as unknown[]) ?? []).length} contradição(ões) detectada(s).`;
    case 'NEXT_ACTIONS':
      return `${((payload.actions as unknown[]) ?? []).length} ação(ões) sugerida(s).`;
    case 'TIMELINE':
      return `${((payload.events as unknown[]) ?? []).length} evento(s) na linha do tempo.`;
    case 'EVIDENCE_MAP':
      return `${((payload.claims as unknown[]) ?? []).length} alegação(ões) mapeada(s), ${
        ((payload.gaps as unknown[]) ?? []).length
      } sem prova.`;
    case 'CLIENT_EXPLANATION':
      return String(payload.text ?? '').slice(0, 300);
    case 'TRIAL_SIMULATION':
      return `${((payload.controversialIssues as unknown[]) ?? []).length} questão(ões) controvertida(s).`;
    case 'STRUCTURE_EXTRACTION':
      return `${((payload.parties as unknown[]) ?? []).length} parte(s), ${
        ((payload.claims as unknown[]) ?? []).length
      } alegação(ões).`;
  }
}

// ---------------------------------------------------------------------------
// Efeitos colaterais: atualizam o estado do processo
// ---------------------------------------------------------------------------

async function applySideEffects(
  type: AnalysisType,
  organizationId: string,
  processId: string,
  payload: Record<string, unknown>,
  userId: string | null,
) {
  try {
    if (type === 'PROCESS_SUMMARY') {
      const riskLevel = (payload.riskLevel as RiskLevel) ?? RiskLevel.UNKNOWN;
      await prisma.process.update({
        where: { id: processId },
        data: {
          executiveSummary: String(payload.executiveSummary ?? ''),
          currentSituation: String(payload.currentSituation ?? ''),
          probableNextStep: String(payload.probableNextStep ?? ''),
          riskLevel,
          riskScore: Number(payload.riskScore ?? 50),
          riskRationale: String(payload.riskRationale ?? ''),
          lastAnalyzedAt: new Date(),
        },
      });

      if ((riskLevel === 'HIGH' || riskLevel === 'CRITICAL') && userId) {
        await prisma.notification.create({
          data: {
            organizationId,
            userId,
            processId,
            kind: NotificationKind.HIGH_RISK_DETECTED,
            title: 'Risco elevado identificado',
            body: String(payload.riskRationale ?? '').slice(0, 300),
            href: `/processos/${processId}?aba=riscos`,
          },
        });
      }
    }

    if (type === 'TIMELINE') {
      const events = (payload.events as { date: string; type: string; title: string; description?: string | null; importance: string }[]) ?? [];
      await prisma.timelineEvent.deleteMany({ where: { processId, isInferred: true } });
      for (const event of events) {
        const occurredAt = new Date(event.date);
        if (Number.isNaN(occurredAt.getTime())) continue;
        await prisma.timelineEvent.create({
          data: {
            organizationId,
            processId,
            occurredAt,
            type: event.type.slice(0, 80),
            title: event.title.slice(0, 200),
            description: event.description ?? null,
            importance: (event.importance as Severity) ?? Severity.MEDIUM,
            isInferred: true,
          },
        });
      }
      const latest = events
        .map((e) => new Date(e.date))
        .filter((d) => !Number.isNaN(d.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      if (latest) {
        await prisma.process.update({ where: { id: processId }, data: { lastMovementAt: latest } });
      }
    }

    if (type === 'STRUCTURE_EXTRACTION') {
      const parties = (payload.parties as { name: string; role: string; side: string }[]) ?? [];

      /*
        Reanalisar substitui o que a extração tinha achado antes, senão cada
        execução empilha partes e a ficha do processo vira um depósito.

        Mas só apagamos o que veio da extração: se alguém preencheu CPF/CNPJ,
        advogado ou anotação naquela parte, o registro é trabalho humano e
        permanece. Perder isso seria pior do que uma duplicata.
      */
      await prisma.party.deleteMany({
        where: {
          processId,
          documentId: null,
          lawyerName: null,
          notes: null,
        },
      });

      for (const party of parties) {
        const existing = await prisma.party.findFirst({
          where: { processId, name: { equals: party.name, mode: 'insensitive' } },
        });
        if (!existing) {
          await prisma.party.create({
            data: {
              organizationId,
              processId,
              name: party.name.slice(0, 200),
              role: party.role as never,
              side: party.side as never,
            },
          });
        }
      }

      const claims = (payload.claims as { text: string; kind: string; side: string }[]) ?? [];
      await prisma.claim.deleteMany({ where: { processId } });
      for (const claim of claims) {
        await prisma.claim.create({
          data: {
            organizationId,
            processId,
            text: claim.text,
            kind: claim.kind as never,
            raisedBySide: claim.side as never,
          },
        });
      }

      const issues = (payload.legalIssues as { title: string; description?: string }[]) ?? [];
      await prisma.legalIssue.deleteMany({ where: { processId } });
      for (const issue of issues) {
        await prisma.legalIssue.create({
          data: {
            organizationId,
            processId,
            title: issue.title.slice(0, 300),
            description: issue.description ?? null,
          },
        });
      }
    }

    if (type === 'EVIDENCE_MAP') {
      const claims = (payload.claims as {
        text: string;
        kind: string;
        side: string;
        strength: string;
        strengthRationale: string;
      }[]) ?? [];
      for (const claim of claims) {
        const existing = await prisma.claim.findFirst({ where: { processId, text: claim.text } });
        if (existing) {
          await prisma.claim.update({
            where: { id: existing.id },
            data: {
              evidenceStrength: claim.strength as never,
              strengthRationale: claim.strengthRationale,
            },
          });
        }
      }
    }
  } catch (err) {
    // Efeitos colaterais não devem invalidar uma análise já concluída.
    logError('analysis.sideEffects', err, { type, processId });
  }
}

/**
 * Sequência executada após o processamento dos documentos: estrutura o
 * processo, resume e monta a linha do tempo. É o que preenche a tela do
 * processo sem que o usuário precise clicar em nada.
 */
export async function runInitialAnalyses(
  organizationId: string,
  processId: string,
  userId: string | null,
  onProgress?: (label: string) => Promise<void> | void,
) {
  const sequence: AnalysisType[] = [
    AnalysisType.STRUCTURE_EXTRACTION,
    AnalysisType.PROCESS_SUMMARY,
    AnalysisType.TIMELINE,
  ];

  for (const type of sequence) {
    await onProgress?.(ANALYSIS_LABELS[type]);
    try {
      await runAnalysis({ organizationId, processId, type, userId });
    } catch (err) {
      logError('analysis.initial', err, { type, processId });
    }
  }
}
