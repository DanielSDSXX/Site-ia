import type { BuiltContext } from '@/lib/rag/context';
import {
  containsAny,
  extractDates,
  extractMoney,
  extractiveSummary,
  normalizeText,
  splitSentences,
  tokenize,
} from '@/lib/text/nlp';
import type {
  AdversarialOut,
  ClientExplanationOut,
  ContradictionsOut,
  EvidenceMapOut,
  FindingOut,
  NextActionsOut,
  StructureOut,
  SummaryOut,
  TimelineOut,
  TrialSimulationOut,
} from './types';

/**
 * Motores heurísticos — usados quando nenhum LLM está conectado.
 *
 * IMPORTANTE: isto NÃO simula um LLM. São análises estruturais determinísticas
 * sobre o texto real dos autos: contagem de termos, extração de datas e
 * valores, comparação entre peças, detecção de alegações sem lastro. Elas são
 * genuínas — e limitadas. Toda saída daqui é marcada com `demo: true` e a
 * interface avisa o usuário de que a leitura semântica de um modelo de
 * linguagem não foi aplicada.
 *
 * Preferimos isto a duas alternativas piores: (a) desligar o produto sem
 * chave de API, (b) apresentar texto genérico como se fosse análise de IA.
 */

export const HEURISTIC_MODEL = 'local-extractive-v1';

export interface HeuristicProcessInfo {
  number: string;
  subject: string | null;
  court: string | null;
  status: string;
  ourSideName: string | null;
  opposingSideName: string | null;
  documentKinds: string[];
  documentCount: number;
  pagesWithoutText: number;
  openDeadlines: { title: string; dueDate: Date }[];
  lastDocumentDate: Date | null;
}

export interface HeuristicInput {
  process: HeuristicProcessInfo;
  context: BuiltContext;
}

interface Sentence {
  ref: string;
  text: string;
  documentTitle: string;
  documentKind: string;
  pageNumber: number;
}

function sentencesOf(context: BuiltContext): Sentence[] {
  const out: Sentence[] = [];
  for (const block of context.blocks) {
    for (const text of splitSentences(block.chunk.content)) {
      out.push({
        ref: block.ref,
        text,
        documentTitle: block.chunk.documentTitle,
        documentKind: block.chunk.documentKind,
        pageNumber: block.chunk.pageNumber,
      });
    }
  }
  return out;
}

const ALLEGATION_VERBS = ['alega', 'afirma', 'sustenta', 'aduz', 'narra', 'relata', 'informa que', 'assevera'];
const REQUEST_VERBS = ['requer', 'pugna', 'pleiteia', 'postula', 'pede a', 'requer-se', 'seja condenad'];
const DEFENSE_TERMS = ['impugna', 'nega', 'refuta', 'não procede', 'improcedente', 'inexiste', 'preliminar'];
const EVIDENCE_MARKERS = [
  'doc.', 'documento anexo', 'anexo', 'anexa', 'anexada', 'comprovante', 'em anexo', 'fls.', 'id.',
  'extrato', 'conforme documento', 'conforme extrato', 'juntada', 'juntado', 'acostado', 'nota fiscal',
  'protocolo', 'contrato de', 'gravação', 'print', 'certidão',
];

/**
 * Marcadores de contradição explícita: expressões com que uma peça contesta
 * diretamente um dado da outra. São o sinal mais confiável que uma heurística
 * lexical consegue obter — quando presentes junto de um número, quase sempre
 * há de fato uma divergência a conferir.
 */
const CONTRADICTION_MARKERS = [
  'e não',
  'ao contrário do alegado',
  'ao contrário do que',
  'diverge',
  'divergente',
  'não corresponde',
  'difere do',
  'ao contrário do afirmado',
  'imprecisão',
  'inverídic',
  'não confere',
  'contraria o',
];

function classifyClaim(text: string): 'FACT' | 'ALLEGATION' | 'REQUEST' | 'THESIS' | 'DEFENSE' {
  if (containsAny(text, REQUEST_VERBS)) return 'REQUEST';
  if (containsAny(text, DEFENSE_TERMS)) return 'DEFENSE';
  if (containsAny(text, ALLEGATION_VERBS)) return 'ALLEGATION';
  return 'FACT';
}

function sideOfDocument(kind: string): 'OURS' | 'OPPOSING' | 'NEUTRAL' {
  // Sem saber de que lado o escritório está, a atribuição por peça é
  // apenas uma pista. O usuário corrige na tela de Partes.
  if (kind === 'INITIAL_PETITION' || kind === 'REPLY') return 'OURS';
  if (kind === 'ANSWER' || kind === 'APPEAL') return 'OPPOSING';
  return 'NEUTRAL';
}

// ---------------------------------------------------------------------------
// Resumo executivo
// ---------------------------------------------------------------------------

export function heuristicSummary(input: HeuristicInput): SummaryOut {
  const { process, context } = input;
  const sentences = sentencesOf(context);

  if (sentences.length === 0) {
    return {
      executiveSummary:
        'Não foi possível identificar essa informação nos documentos disponíveis: nenhum trecho de texto foi indexado para este processo.',
      currentSituation: 'Nenhum documento processado até o momento.',
      probableNextStep: 'Envie as peças do processo para que a análise possa ser executada.',
      riskLevel: 'UNKNOWN',
      riskScore: 50,
      riskRationale: 'Sem documentos indexados não há base para estimar risco.',
      keyPoints: [],
      confidence: 'LOW',
    };
  }

  const petition = sentences.filter((s) => s.documentKind === 'INITIAL_PETITION');
  const decisions = sentences.filter((s) => s.documentKind === 'DECISION' || s.documentKind === 'SENTENCE');
  const base = petition.length > 0 ? petition : sentences;

  const summarySentences = extractiveSummary(base.map((s) => s.text).join(' '), 4);
  const keyPoints = summarySentences.map((text) => {
    const source = base.find((s) => s.text.includes(text.slice(0, 40))) ?? base[0];
    return { text: text.slice(0, 600), refs: [source.ref] };
  });

  const kinds = new Set(process.documentKinds);
  const currentSituation = describeCurrentSituation(kinds, decisions);
  const probableNextStep = describeNextStep(kinds);
  const risk = heuristicRisk(input);

  const executiveSummary = [
    `Processo ${process.number}${process.subject ? ` — ${process.subject}` : ''}${
      process.court ? `, ${process.court}` : ''
    }.`,
    process.ourSideName && process.opposingSideName
      ? `Partes identificadas: ${process.ourSideName} e ${process.opposingSideName}.`
      : 'As partes ainda não foram confirmadas no cadastro do processo.',
    `Foram indexados ${process.documentCount} documento(s): ${[...kinds]
      .map(translateKindPt)
      .join(', ')}.`,
    summarySentences[0] ? `Do texto dos autos: "${truncateQuote(summarySentences[0])}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    executiveSummary,
    currentSituation,
    probableNextStep,
    riskLevel: risk.level,
    riskScore: risk.score,
    riskRationale: risk.rationale,
    keyPoints,
    confidence: 'LOW',
  };
}

function describeCurrentSituation(kinds: Set<string>, decisions: Sentence[]): string {
  if (decisions.length > 0) {
    return `Há decisão ou sentença nos autos. Trecho localizado: "${truncateQuote(decisions[0].text)}"`;
  }
  if (kinds.has('ANSWER')) return 'A defesa já foi apresentada; o processo está na fase de resposta/réplica.';
  if (kinds.has('INITIAL_PETITION')) return 'Consta a petição inicial; ainda não foi localizada contestação nos documentos enviados.';
  return 'Não foi possível determinar a fase processual a partir dos documentos enviados.';
}

function describeNextStep(kinds: Set<string>): string {
  const prefix = 'Expectativa, não certeza: ';
  if (kinds.has('SENTENCE')) return `${prefix}o próximo ato tende a ser a interposição de recurso ou o trânsito em julgado.`;
  if (kinds.has('REPLY')) return `${prefix}o próximo ato tende a ser a decisão de saneamento ou a designação de audiência.`;
  if (kinds.has('ANSWER')) return `${prefix}o próximo ato tende a ser a réplica à contestação.`;
  if (kinds.has('INITIAL_PETITION')) return `${prefix}o próximo ato tende a ser a citação da parte contrária e a apresentação de contestação.`;
  return 'Não foi possível identificar essa informação nos documentos disponíveis.';
}

// ---------------------------------------------------------------------------
// Risco
// ---------------------------------------------------------------------------

export function heuristicRisk(input: HeuristicInput): {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  score: number;
  rationale: string;
} {
  const { process, context } = input;
  if (context.blocks.length === 0) {
    return { level: 'UNKNOWN', score: 50, rationale: 'Sem documentos indexados.' };
  }

  const reasons: string[] = [];
  let score = 30;

  const evidenceMap = heuristicEvidenceMap(input);
  const unsupported = evidenceMap.gaps.length;
  if (unsupported > 0) {
    score += Math.min(25, unsupported * 5);
    reasons.push(`${unsupported} alegação(ões) sem referência documental localizada nos autos`);
  }

  const contradictions = heuristicContradictions(input).contradictions;
  if (contradictions.length > 0) {
    score += Math.min(20, contradictions.length * 7);
    reasons.push(`${contradictions.length} divergência(s) numérica(s) ou de data entre peças`);
  }

  if (process.pagesWithoutText > 0) {
    score += Math.min(10, process.pagesWithoutText);
    reasons.push(`${process.pagesWithoutText} página(s) sem texto extraído (possível documento digitalizado sem OCR)`);
  }

  const urgentDeadlines = process.openDeadlines.filter(
    (d) => d.dueDate.getTime() - Date.now() < 7 * 86_400_000,
  ).length;
  if (urgentDeadlines > 0) {
    score += urgentDeadlines * 8;
    reasons.push(`${urgentDeadlines} prazo(s) com vencimento em até 7 dias`);
  }

  if (!process.documentKinds.includes('ANSWER') && process.documentKinds.includes('INITIAL_PETITION')) {
    reasons.push('contestação ainda não localizada entre os documentos enviados');
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 75 ? 'CRITICAL' : score >= 55 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW';

  return {
    level,
    score,
    rationale:
      reasons.length > 0
        ? `Fatores considerados nesta estimativa estrutural: ${reasons.join('; ')}. Trata-se de uma avaliação de risco baseada em sinais objetivos dos autos, não de previsão de resultado.`
        : 'Nenhum sinal estrutural de risco elevado foi identificado nos documentos indexados.',
  };
}

// ---------------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------------

export function heuristicTimeline(input: HeuristicInput): TimelineOut {
  const events: TimelineOut['events'] = [];
  const seen = new Set<string>();

  for (const block of input.context.blocks) {
    const dates = extractDates(block.chunk.content);
    for (const found of dates) {
      const year = found.date.getUTCFullYear();
      if (year < 1990 || year > new Date().getFullYear() + 5) continue;

      const around = block.chunk.content.slice(
        Math.max(0, found.offset - 160),
        Math.min(block.chunk.content.length, found.offset + 160),
      );
      const type = eventTypeFor(around, block.chunk.documentKind);
      const key = `${found.date.toISOString().slice(0, 10)}|${type}`;
      if (seen.has(key)) continue;
      seen.add(key);

      events.push({
        date: found.date.toISOString().slice(0, 10),
        type,
        title: `${type} — ${block.chunk.documentTitle}`,
        description: truncateQuote(around, 300),
        importance: ['Decisão', 'Sentença', 'Audiência', 'Prazo'].includes(type) ? 'HIGH' : 'MEDIUM',
        refs: [block.ref],
      });
    }
  }

  return {
    events: events.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60),
  };
}

const EVENT_PATTERNS: [string, string[]][] = [
  ['Distribuição', ['distribuíd', 'distribuic', 'protocol', 'ajuizad']],
  ['Citação', ['citaç', 'citad', 'mandado de citação']],
  ['Intimação', ['intimaç', 'intimad']],
  ['Contestação', ['contestaç']],
  ['Réplica', ['réplica', 'replica', 'impugnação à contestação']],
  ['Audiência', ['audiência', 'audiencia', 'conciliação', 'instrução e julgamento']],
  ['Decisão', ['decisão', 'decisao', 'defiro', 'indefiro', 'liminar', 'tutela']],
  ['Sentença', ['sentença', 'sentenca', 'julgo procedente', 'julgo improcedente']],
  ['Recurso', ['apelação', 'agravo', 'recurso', 'embargos']],
  ['Perícia', ['perícia', 'pericia', 'laudo']],
  ['Prazo', ['prazo de', 'no prazo', 'prazo legal']],
  ['Pagamento', ['pagamento', 'depósito', 'quitação']],
];

function eventTypeFor(context: string, documentKind: string): string {
  for (const [type, terms] of EVENT_PATTERNS) {
    if (containsAny(context, terms)) return type;
  }
  const byKind: Record<string, string> = {
    INITIAL_PETITION: 'Distribuição',
    ANSWER: 'Contestação',
    REPLY: 'Réplica',
    DECISION: 'Decisão',
    SENTENCE: 'Sentença',
    APPEAL: 'Recurso',
    HEARING_MINUTES: 'Audiência',
    EXPERT_REPORT: 'Perícia',
  };
  return byKind[documentKind] ?? 'Movimentação';
}

// ---------------------------------------------------------------------------
// Mapa de provas
// ---------------------------------------------------------------------------

export function heuristicEvidenceMap(input: HeuristicInput): EvidenceMapOut {
  const sentences = sentencesOf(input.context);
  const claimSentences = sentences.filter(
    (s) => containsAny(s.text, ALLEGATION_VERBS) || containsAny(s.text, REQUEST_VERBS),
  );

  const evidenceSentences = sentences.filter((s) => containsAny(s.text, EVIDENCE_MARKERS));
  const evidenceTokens = evidenceSentences.map((s) => new Set(tokenize(s.text)));

  const claims: EvidenceMapOut['claims'] = [];
  const gaps: EvidenceMapOut['gaps'] = [];

  for (const sentence of claimSentences.slice(0, 40)) {
    const tokens = new Set(tokenize(sentence.text));
    const supporting: EvidenceMapOut['claims'][number]['supporting'] = [];

    evidenceTokens.forEach((set, index) => {
      // Sobreposição relativa: uma frase curta de alegação e um parágrafo
      // longo de prova nunca teriam Jaccard alto, mesmo tratando do mesmo fato.
      const similarity = overlapCoefficient(tokens, set);
      if (similarity >= 0.3) {
        supporting.push({
          ref: evidenceSentences[index].ref,
          note: `Trecho menciona documento com sobreposição lexical de ${(similarity * 100).toFixed(0)}% com a alegação.`,
        });
      }
    });

    const selfMentionsEvidence = containsAny(sentence.text, EVIDENCE_MARKERS);
    if (selfMentionsEvidence) {
      supporting.push({ ref: sentence.ref, note: 'A própria alegação remete a documento anexo.' });
    }

    const strength =
      supporting.length >= 3 ? 'STRONG' : supporting.length === 2 ? 'MODERATE' : supporting.length === 1 ? 'WEAK' : 'NONE';

    claims.push({
      text: truncateQuote(sentence.text, 500),
      kind: classifyClaim(sentence.text),
      side: sideOfDocument(sentence.documentKind),
      strength,
      strengthRationale:
        supporting.length === 0
          ? 'Nenhum trecho indexado faz referência a documento que sustente esta alegação. Isso não significa que a prova não exista nos autos — significa que ela não foi localizada nos documentos enviados à plataforma.'
          : `Foram localizados ${supporting.length} trecho(s) com menção a documento relacionado.`,
      supporting: supporting.slice(0, 5),
      contradicting: [],
    });

    if (supporting.length === 0) {
      gaps.push({
        claim: truncateQuote(sentence.text, 400),
        note: 'Alegação sem referência documental localizada nos trechos indexados.',
      });
    }
  }

  return { claims, gaps: gaps.slice(0, 20) };
}

// ---------------------------------------------------------------------------
// Contradições
// ---------------------------------------------------------------------------

interface ValueMention {
  ref: string;
  documentId: string;
  documentKind: string;
  value: string;
  kind: 'valor' | 'data';
  windowText: string;
  tokens: Set<string>;
  /** A peça contesta explicitamente um dado da outra neste trecho. */
  contested: boolean;
}

function collectValueMentions(input: HeuristicInput): ValueMention[] {
  const mentions: ValueMention[] = [];

  for (const block of input.context.blocks) {
    const content = block.chunk.content;

    const push = (offset: number, raw: string, value: string, kind: 'valor' | 'data') => {
      const windowText = content.slice(Math.max(0, offset - 180), offset + 180);

      // O marcador de contradição só conta se estiver na MESMA frase do número.
      // Numa janela de 360 caracteres, um "e não" de outra oração produziria
      // falso positivo em cascata.
      //
      // A comparação ignora espaçamento porque o valor pode vir quebrado entre
      // linhas no PDF ("R$\n549,00") enquanto a frase já foi normalizada.
      const flatRaw = raw.replace(/\s+/g, ' ');
      const sentence =
        splitSentences(windowText).find((candidate) =>
          candidate.replace(/\s+/g, ' ').includes(flatRaw),
        ) ?? windowText;

      mentions.push({
        ref: block.ref,
        documentId: block.chunk.documentId,
        documentKind: block.chunk.documentKind,
        value,
        kind,
        windowText,
        tokens: new Set(tokenize(windowText)),
        contested: containsAny(sentence, CONTRADICTION_MARKERS),
      });
    };

    for (const money of extractMoney(content)) {
      push(money.offset, money.raw, (money.cents / 100).toFixed(2), 'valor');
    }
    for (const date of extractDates(content)) {
      const year = date.date.getUTCFullYear();
      if (year < 1990 || year > new Date().getFullYear() + 5) continue;
      push(date.offset, date.raw, date.date.toISOString().slice(0, 10), 'data');
    }
  }

  return mentions;
}

/**
 * Quão próximos são dois valores do mesmo tipo, em [0, 1].
 * Para dinheiro, proporção relativa; para datas, distância em dias com
 * decaimento ao longo de um semestre.
 */
function numericProximity(a: ValueMention, b: ValueMention): number {
  if (a.kind === 'valor') {
    const x = Number(a.value);
    const y = Number(b.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    const max = Math.max(Math.abs(x), Math.abs(y));
    if (max === 0) return 1;
    return Math.max(0, 1 - Math.abs(x - y) / max);
  }

  const x = Date.parse(a.value);
  const y = Date.parse(b.value);
  if (Number.isNaN(x) || Number.isNaN(y)) return 0;
  const days = Math.abs(x - y) / 86_400_000;
  return Math.max(0, 1 - days / 180);
}

/** Sobreposição relativa ao menor conjunto — mais justa entre janelas de tamanhos diferentes. */
function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / Math.min(a.size, b.size);
}

/**
 * Detecta divergências objetivas entre peças: o mesmo dado descrito com
 * valores ou datas diferentes em documentos distintos.
 *
 * Duas regras, deliberadamente separadas por confiabilidade:
 *
 *  1. CONTESTAÇÃO EXPLÍCITA (alta confiança) — uma peça usa marcador de
 *     contradição ("e não", "ao contrário do alegado", "diverge") junto de um
 *     número, e outro documento traz um número diferente do mesmo tipo. Esse é
 *     o caso em que uma parte está literalmente dizendo que o dado da outra
 *     está errado.
 *
 *  2. CONTEXTO SEMELHANTE (baixa confiança) — janelas de texto com alta
 *     sobreposição lexical e números diferentes. Útil, porém ruidoso; por isso
 *     entra com severidade e confiança menores.
 *
 * O que uma heurística lexical NÃO alcança: divergências entre trechos escritos
 * com vocabulário completamente distinto. Isso exige leitura semântica de um
 * LLM — mais um motivo para a interface rotular este modo como demonstração.
 */
export function heuristicContradictions(input: HeuristicInput): ContradictionsOut {
  const mentions = collectValueMentions(input);
  const contradictions: ContradictionsOut['contradictions'] = [];
  const seen = new Set<string>();

  const label = (kind: 'valor' | 'data', value: string) =>
    kind === 'valor'
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
      : value.split('-').reverse().join('/');

  const add = (
    a: ValueMention,
    b: ValueMention,
    severity: 'LOW' | 'MEDIUM' | 'HIGH',
    confidence: 'LOW' | 'MEDIUM' | 'HIGH',
    title: string,
    description: string,
  ) => {
    // Deduplicação pelo PAR DE VALORES, não pelo par de trechos: o mesmo
    // R$ 569,70 aparece em várias páginas e geraria o mesmo achado repetido.
    const key = [a.kind, ...[a.value, b.value].sort()].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    contradictions.push({
      title,
      description,
      severity,
      confidence,
      sideA: { ref: a.ref, quote: truncateQuote(a.windowText, 500) },
      sideB: { ref: b.ref, quote: truncateQuote(b.windowText, 500) },
    });
  };

  // Regra 1 — contestação explícita.
  for (const contested of mentions.filter((m) => m.contested)) {
    // Entre os candidatos de outro documento, ficamos apenas com os que
    // compartilham contexto — e com o de maior sobreposição, que é o que a
    // peça contestante está de fato rebatendo.
    const candidates = mentions
      .filter(
        (other) =>
          other.documentId !== contested.documentId &&
          other.kind === contested.kind &&
          other.value !== contested.value,
      )
      .map((other) => ({
        other,
        // Proximidade numérica pesa tanto quanto o contexto: quando uma peça
        // diz "é X, e não Y", X e Y são quase sempre da mesma ordem de
        // grandeza. É isso que separa a divergência real (569,70 × 549,00) do
        // ruído (569,70 × 15.569,70).
        score:
          0.5 * overlapCoefficient(other.tokens, contested.tokens) +
          0.5 * numericProximity(contested, other),
      }))
      .filter((entry) => entry.score >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    for (const { other } of candidates) {
      add(
        other,
        contested,
        'HIGH',
        'MEDIUM',
        contested.kind === 'valor'
          ? `Divergência de valor contestada nos autos (${label('valor', other.value)} × ${label('valor', contested.value)})`
          : `Divergência de data contestada nos autos (${label('data', other.value)} × ${label('data', contested.value)})`,
        `Um dos documentos afirma expressamente que o dado apresentado pela outra peça está incorreto. ` +
          `O primeiro trecho registra ${label(other.kind, other.value)}; o segundo, ${label(
            contested.kind,
            contested.value,
          )}, com linguagem de contestação direta. Confira os dois trechos: uma divergência assumida nos autos costuma ser explorada para atacar a credibilidade da narrativa.`,
      );

      if (contradictions.length >= 15) return { contradictions };
    }
  }

  // Regra 2 — contexto lexicalmente semelhante.
  for (let i = 0; i < mentions.length; i++) {
    for (let j = i + 1; j < mentions.length; j++) {
      const a = mentions[i];
      const b = mentions[j];
      if (a.kind !== b.kind) continue;
      if (a.documentId === b.documentId) continue;
      if (a.value === b.value) continue;

      const similarity = overlapCoefficient(a.tokens, b.tokens);
      if (similarity < 0.34) continue;

      add(
        a,
        b,
        similarity > 0.55 ? 'MEDIUM' : 'LOW',
        'LOW',
        a.kind === 'valor'
          ? `Valores diferentes em contexto semelhante (${label('valor', a.value)} × ${label('valor', b.value)})`
          : `Datas diferentes em contexto semelhante (${label('data', a.value)} × ${label('data', b.value)})`,
        `Dois documentos descrevem contextos com ${(similarity * 100).toFixed(0)}% de sobreposição de termos, ` +
          `mas atribuem ${a.kind === 'valor' ? 'valores' : 'datas'} diferentes. Pode ser uma inconsistência real ou dois fatos distintos — confira os trechos.`,
      );

      if (contradictions.length >= 15) return { contradictions };
    }
  }

  return { contradictions };
}

// ---------------------------------------------------------------------------
// Vulnerabilidades
// ---------------------------------------------------------------------------

export function heuristicVulnerabilities(input: HeuristicInput): {
  findings: FindingOut[];
  overallAssessment: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
} {
  const findings: FindingOut[] = [];
  const { process } = input;

  const evidenceMap = heuristicEvidenceMap(input);
  for (const gap of evidenceMap.gaps.slice(0, 6)) {
    findings.push({
      title: `Sem prova localizada: ${shortLabel(gap.claim)}`,
      description: `A seguinte alegação não teve documento correspondente localizado nos trechos indexados: "${gap.claim}"`,
      rationale:
        'O ônus da prova recai sobre quem alega (art. 373 do CPC). Uma alegação relevante sem prova nos autos é o ponto natural de ataque da parte contrária.',
      suggestion:
        'Verifique se a prova existe e não foi enviada à plataforma; se não existir, avalie produzir a prova ou reposicionar o argumento.',
      severity: 'HIGH',
      confidence: 'LOW',
      refs: [],
    });
  }

  for (const contradiction of heuristicContradictions(input).contradictions.slice(0, 4)) {
    findings.push({
      title: contradiction.title,
      description: contradiction.description,
      rationale: 'Divergências numéricas entre peças costumam ser exploradas para atacar a credibilidade da narrativa.',
      suggestion: 'Confira os dois trechos e, se houver erro material, providencie a retificação antes que a parte contrária aponte.',
      severity: contradiction.severity,
      confidence: 'LOW',
      refs: [contradiction.sideA.ref, contradiction.sideB.ref],
    });
  }

  if (process.pagesWithoutText > 0) {
    findings.push({
      title: 'Páginas sem texto extraído',
      description: `${process.pagesWithoutText} página(s) dos documentos enviados não possuem camada de texto. O conteúdo dessas páginas NÃO foi analisado.`,
      rationale:
        'Uma análise que ignora parte dos autos é incompleta por construção — a informação decisiva pode estar exatamente nas páginas não lidas.',
      suggestion: 'Ative o OCR (OCR_PROVIDER=tesseract) ou reenvie essas páginas em formato com texto pesquisável.',
      severity: 'MEDIUM',
      confidence: 'HIGH',
      refs: [],
    });
  }

  if (!process.documentKinds.includes('POWER_OF_ATTORNEY')) {
    findings.push({
      title: 'Procuração não localizada entre os documentos enviados',
      description: 'Nenhum documento enviado foi classificado como procuração.',
      rationale: 'A ausência de instrumento de mandato regular é causa recorrente de determinação de emenda e pode gerar atos processuais inválidos.',
      suggestion: 'Confirme se a procuração está nos autos; se estiver, envie-a à plataforma para completar a análise.',
      severity: 'LOW',
      confidence: 'MEDIUM',
      refs: [],
    });
  }

  const overdue = process.openDeadlines.filter((d) => d.dueDate.getTime() < Date.now());
  if (overdue.length > 0) {
    findings.push({
      title: `${overdue.length} prazo(s) cadastrado(s) já vencido(s)`,
      description: overdue.map((d) => `${d.title} (vencido em ${d.dueDate.toLocaleDateString('pt-BR')})`).join('; '),
      rationale: 'Prazo vencido sem providência pode implicar preclusão.',
      suggestion: 'Revise imediatamente estes prazos e o respectivo cumprimento.',
      severity: 'HIGH',
      confidence: 'HIGH',
      refs: [],
    });
  }

  const sentences = sentencesOf(input.context);
  const hedging = sentences.filter((s) =>
    containsAny(s.text, ['ao que tudo indica', 'possivelmente', 'acredita-se', 'salvo melhor juízo', 'provavelmente']),
  );
  for (const sentence of hedging.slice(0, 2)) {
    findings.push({
      title: 'Afirmação formulada com baixa assertividade',
      description: `Trecho com linguagem hesitante: "${truncateQuote(sentence.text, 300)}"`,
      rationale: 'Formulações vacilantes em peça própria enfraquecem a tese e podem ser citadas contra quem as escreveu.',
      suggestion: 'Avalie reescrever com base na prova disponível ou remover a afirmação.',
      severity: 'LOW',
      confidence: 'MEDIUM',
      refs: [sentence.ref],
    });
  }

  return {
    findings,
    overallAssessment:
      findings.length === 0
        ? 'A verificação estrutural não encontrou fragilidades objetivas nos documentos indexados. Isso não equivale a uma avaliação de mérito.'
        : `Foram identificados ${findings.length} ponto(s) de atenção por verificação estrutural dos autos. Esta análise não substitui a leitura crítica de um advogado nem a avaliação semântica de um modelo de linguagem.`,
    confidence: 'LOW',
  };
}

// ---------------------------------------------------------------------------
// Adversário
// ---------------------------------------------------------------------------

export function heuristicAdversarial(input: HeuristicInput): AdversarialOut {
  const evidenceMap = heuristicEvidenceMap(input);
  const sentences = sentencesOf(input.context);

  const opponentArguments: FindingOut[] = [];
  const counterArguments: FindingOut[] = [];

  for (const gap of evidenceMap.gaps.slice(0, 5)) {
    opponentArguments.push({
      title: 'Ataque à ausência de prova',
      description: `A parte contrária tende a sustentar que a alegação a seguir não veio acompanhada de prova: "${gap.claim}"`,
      rationale: 'Alegações sem lastro documental são o alvo mais barato e mais eficaz da defesa.',
      suggestion: null,
      severity: 'HIGH',
      confidence: 'LOW',
      refs: [],
    });
    counterArguments.push({
      title: 'Possível resposta',
      description:
        'Localizar e juntar a prova correspondente, ou demonstrar que o fato é incontroverso / de conhecimento comum / objeto de inversão do ônus da prova, conforme o caso.',
      rationale: 'Enfrentar a ausência antes que ela seja apontada reduz o dano.',
      suggestion: 'Verificar se a prova já existe fora da plataforma antes de considerar produzi-la.',
      severity: 'MEDIUM',
      confidence: 'LOW',
      refs: [],
    });
  }

  // Argumentos que a parte contrária JÁ apresentou nos autos.
  const opposingSentences = sentences.filter(
    (s) => s.documentKind === 'ANSWER' && containsAny(s.text, DEFENSE_TERMS),
  );
  for (const sentence of opposingSentences.slice(0, 6)) {
    opponentArguments.push({
      title: 'Argumento já deduzido pela parte contrária',
      description: truncateQuote(sentence.text, 600),
      rationale: 'Este argumento consta literalmente da defesa apresentada nos autos.',
      suggestion: null,
      severity: 'MEDIUM',
      confidence: 'MEDIUM',
      refs: [sentence.ref],
    });
  }

  const likelyQuestions = evidenceMap.gaps
    .slice(0, 5)
    .map((gap) => `Qual documento comprova: "${truncateQuote(gap.claim, 150)}"?`);

  if (input.process.pagesWithoutText > 0) {
    likelyQuestions.push('Há documentos nos autos que ainda não foram lidos pela plataforma (páginas sem texto). O que consta neles?');
  }

  return { opponentArguments, counterArguments, likelyQuestions, confidence: 'LOW' };
}

// ---------------------------------------------------------------------------
// Simulação analítica
// ---------------------------------------------------------------------------

export function heuristicTrialSimulation(input: HeuristicInput): TrialSimulationOut {
  const evidenceMap = heuristicEvidenceMap(input);

  const plaintiffPoints: FindingOut[] = [];
  const defendantPoints: FindingOut[] = [];

  for (const claim of evidenceMap.claims) {
    const target = claim.side === 'OPPOSING' ? defendantPoints : plaintiffPoints;
    if (claim.strength === 'NONE') continue;
    if (target.length >= 6) continue;
    target.push({
      title: claim.kind === 'REQUEST' ? 'Pedido com suporte documental' : 'Alegação com suporte documental',
      description: claim.text,
      rationale: claim.strengthRationale,
      suggestion: null,
      severity: claim.strength === 'STRONG' ? 'HIGH' : 'MEDIUM',
      confidence: 'LOW',
      refs: claim.supporting.map((s) => s.ref),
    });
  }

  const controversialIssues: FindingOut[] = heuristicContradictions(input)
    .contradictions.slice(0, 5)
    .map((c) => ({
      title: c.title,
      description: c.description,
      rationale: 'Divergência entre peças indica ponto que precisará ser resolvido pela instrução.',
      suggestion: null,
      severity: c.severity,
      confidence: 'LOW',
      refs: [c.sideA.ref, c.sideB.ref],
    }));

  const decisiveEvidence = evidenceMap.claims
    .filter((c) => c.strength === 'STRONG')
    .slice(0, 5)
    .map((c) => ({ text: c.text, refs: c.supporting.map((s) => s.ref) }));

  const clarificationsNeeded = evidenceMap.gaps
    .slice(0, 5)
    .map((g) => `Falta esclarecer o suporte probatório de: "${truncateQuote(g.claim, 180)}"`);

  return {
    plaintiffPoints,
    defendantPoints,
    controversialIssues,
    decisiveEvidence,
    clarificationsNeeded,
    confidence: 'LOW',
  };
}

// ---------------------------------------------------------------------------
// Próximas ações
// ---------------------------------------------------------------------------

export function heuristicNextActions(input: HeuristicInput): NextActionsOut {
  const actions: NextActionsOut['actions'] = [];
  const { process } = input;

  const soon = process.openDeadlines
    .filter((d) => d.dueDate.getTime() - Date.now() < 7 * 86_400_000)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  for (const deadline of soon.slice(0, 3)) {
    const overdue = deadline.dueDate.getTime() < Date.now();
    actions.push({
      title: overdue ? `Prazo vencido: ${deadline.title}` : `Cumprir prazo: ${deadline.title}`,
      description: `Vencimento em ${deadline.dueDate.toLocaleDateString('pt-BR')}.`,
      rationale: overdue
        ? 'Prazo cadastrado já vencido — risco de preclusão.'
        : 'Prazo cadastrado com vencimento nos próximos 7 dias.',
      priority: 'URGENT',
      refs: [],
    });
  }

  const gaps = heuristicEvidenceMap(input).gaps;
  if (gaps.length > 0) {
    actions.push({
      title: `Reunir prova para ${gaps.length} alegação(ões) sem lastro`,
      description: gaps
        .slice(0, 3)
        .map((g) => `• ${truncateQuote(g.claim, 160)}`)
        .join('\n'),
      rationale: 'Estas alegações não têm documento correspondente localizado nos trechos indexados.',
      priority: 'HIGH',
      refs: [],
    });
  }

  if (process.pagesWithoutText > 0) {
    actions.push({
      title: 'Tornar legíveis as páginas digitalizadas',
      description: `${process.pagesWithoutText} página(s) não têm texto extraível e ficaram fora da análise.`,
      rationale: 'Sem OCR, parte dos autos permanece invisível para qualquer análise da plataforma.',
      priority: 'MEDIUM',
      refs: [],
    });
  }

  if (!process.documentKinds.includes('ANSWER') && process.documentKinds.includes('INITIAL_PETITION')) {
    actions.push({
      title: 'Verificar a existência de contestação',
      description: 'Nenhum documento enviado foi classificado como contestação.',
      rationale: 'Ou a defesa ainda não foi apresentada, ou a peça não foi enviada à plataforma — os dois casos exigem providências diferentes.',
      priority: 'MEDIUM',
      refs: [],
    });
  }

  if (process.documentCount === 0) {
    actions.push({
      title: 'Enviar os documentos do processo',
      description: 'Ainda não há documentos indexados para este processo.',
      rationale: 'Toda a inteligência da plataforma depende do texto dos autos.',
      priority: 'URGENT',
      refs: [],
    });
  }

  return { actions: actions.slice(0, 7), confidence: 'LOW' };
}

// ---------------------------------------------------------------------------
// Estrutura (partes, alegações, questões)
// ---------------------------------------------------------------------------

const PARTY_PATTERNS: [RegExp, 'PLAINTIFF' | 'DEFENDANT'][] = [
  [/(?:autor(?:a)?|requerente|reclamante|exequente|impetrante)\s*:?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][^\n,;.]{3,80})/gi, 'PLAINTIFF'],
  [/(?:r[ée]u|r[ée]|requerid[ao]|reclamad[ao]|executad[ao]|impetrad[ao])\s*:?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][^\n,;.]{3,80})/gi, 'DEFENDANT'],
];

export function heuristicStructure(input: HeuristicInput): StructureOut {
  const parties: StructureOut['parties'] = [];
  const seenNames = new Set<string>();

  for (const block of input.context.blocks) {
    for (const [pattern, role] of PARTY_PATTERNS) {
      for (const match of block.chunk.content.matchAll(pattern)) {
        const name = match[1]?.trim().replace(/\s+/g, ' ');
        if (!name || name.length < 4) continue;
        const key = normalizeText(name);
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        parties.push({
          name: name.slice(0, 200),
          role,
          side: role === 'PLAINTIFF' ? 'OURS' : 'OPPOSING',
          refs: [block.ref],
        });
        if (parties.length >= 12) break;
      }
    }
  }

  // "X em face de Y" / "X contra Y"
  for (const block of input.context.blocks) {
    const match = block.chunk.content.match(
      /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\w\sÁÀÂÃÉÊÍÓÔÕÚÇç.&-]{4,70})\s+(?:em face de|contra|x)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\w\sÁÀÂÃÉÊÍÓÔÕÚÇç.&-]{4,70})/,
    );
    if (match) {
      for (const [index, raw] of [match[1], match[2]].entries()) {
        const name = raw.trim().replace(/\s+/g, ' ');
        const key = normalizeText(name);
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        parties.push({
          name: name.slice(0, 200),
          role: index === 0 ? 'PLAINTIFF' : 'DEFENDANT',
          side: index === 0 ? 'OURS' : 'OPPOSING',
          refs: [block.ref],
        });
      }
      break;
    }
  }

  const sentences = sentencesOf(input.context);
  const claims: StructureOut['claims'] = sentences
    .filter((s) => containsAny(s.text, [...ALLEGATION_VERBS, ...REQUEST_VERBS, ...DEFENSE_TERMS]))
    .slice(0, 40)
    .map((s) => ({
      text: truncateQuote(s.text, 800),
      kind: classifyClaim(s.text),
      side: sideOfDocument(s.documentKind),
      refs: [s.ref],
    }));

  const issueTerms = [
    'dano moral', 'dano material', 'cobrança indevida', 'repetição do indébito', 'rescisão contratual',
    'ilegitimidade passiva', 'prescrição', 'decadência', 'inépcia', 'juros', 'multa', 'honorários',
    'tutela de urgência', 'nulidade', 'inversão do ônus da prova',
  ];
  const legalIssues: StructureOut['legalIssues'] = [];
  for (const term of issueTerms) {
    const hit = input.context.blocks.find((b) => containsAny(b.chunk.content, [term]));
    if (hit) {
      legalIssues.push({
        title: term.charAt(0).toUpperCase() + term.slice(1),
        description: `Termo localizado no texto dos autos em ${hit.chunk.documentTitle}, página ${hit.chunk.pageNumber}.`,
        refs: [hit.ref],
      });
    }
  }

  return { parties, claims, legalIssues: legalIssues.slice(0, 12) };
}

// ---------------------------------------------------------------------------
// Explicação para o cliente
// ---------------------------------------------------------------------------

const GLOSSARY: [string, string][] = [
  ['contestação', 'a defesa apresentada pelo réu'],
  ['petição inicial', 'o documento que dá início ao processo'],
  ['réplica', 'a resposta do autor à defesa do réu'],
  ['preliminar', 'uma questão que o juiz precisa resolver antes de analisar o mérito'],
  ['ilegitimidade passiva', 'a alegação de que a pessoa processada não é a responsável pelo problema discutido'],
  ['mérito', 'o assunto principal discutido no processo'],
  ['tutela de urgência', 'uma decisão rápida, antes do fim do processo, para evitar um prejuízo imediato'],
  ['preclusão', 'a perda da oportunidade de praticar um ato porque o prazo passou'],
  ['ônus da prova', 'a obrigação de provar aquilo que se afirma'],
  ['improcedente', 'quando o juiz não acolhe o pedido'],
  ['procedente', 'quando o juiz acolhe o pedido'],
  ['saneamento', 'a fase em que o juiz organiza o processo e define o que ainda precisa ser provado'],
  ['trânsito em julgado', 'o momento em que a decisão não pode mais ser alterada por recurso'],
  ['citação', 'o ato de comunicar oficialmente a pessoa de que ela está sendo processada'],
  ['intimação', 'a comunicação oficial sobre um andamento do processo'],
  ['agravo', 'um tipo de recurso contra decisões tomadas durante o processo'],
  ['apelação', 'o recurso contra a sentença'],
  ['sentença', 'a decisão do juiz que encerra o processo na primeira instância'],
];

export function heuristicClientExplanation(input: HeuristicInput, summary: SummaryOut): ClientExplanationOut {
  const usedTerms = GLOSSARY.filter(([term]) =>
    containsAny(`${summary.executiveSummary} ${summary.currentSituation} ${summary.probableNextStep}`, [term]),
  );

  let text = [
    `Sobre o seu processo (${input.process.number}):`,
    '',
    plainify(summary.executiveSummary, usedTerms),
    '',
    `Situação atual: ${plainify(summary.currentSituation, usedTerms)}`,
    '',
    `O que tende a acontecer em seguida: ${plainify(summary.probableNextStep, usedTerms)}`,
    '',
    'Importante: este resumo foi montado automaticamente a partir dos documentos enviados. ' +
      'Ele não é uma previsão de resultado e não substitui a orientação do seu advogado.',
  ].join('\n');

  if (input.process.pagesWithoutText > 0) {
    text += `\n\nObservação técnica: ${input.process.pagesWithoutText} página(s) dos documentos não puderam ser lidas automaticamente e não entraram neste resumo.`;
  }

  return {
    text,
    glossary: usedTerms.map(([term, meaning]) => ({ term, meaning })),
  };
}

function plainify(text: string, glossary: [string, string][]): string {
  let out = text;
  for (const [term, meaning] of glossary) {
    const pattern = new RegExp(`\\b${term}\\b`, 'i');
    if (pattern.test(out)) {
      out = out.replace(pattern, `${term} (${meaning})`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

function truncateQuote(text: string, max = 400): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Rótulo curto para título de achado.
 *
 * Sem isto, seis lacunas de prova viram seis linhas com o mesmo texto na tela
 * — o usuário precisa distinguir os achados sem abrir cada um.
 */
function shortLabel(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const withoutPreamble = clean.replace(
    /^(a autora|o autor|a r[ée]|o r[ée]u|a parte autora|a parte r[ée])\s+/i,
    '',
  );
  return withoutPreamble.length <= max
    ? withoutPreamble
    : `${withoutPreamble.slice(0, max - 1)}…`;
}

function translateKindPt(kind: string): string {
  const map: Record<string, string> = {
    INITIAL_PETITION: 'petição inicial',
    ANSWER: 'contestação',
    REPLY: 'réplica',
    DECISION: 'decisão',
    SENTENCE: 'sentença',
    APPEAL: 'recurso',
    EVIDENCE: 'prova documental',
    EXPERT_REPORT: 'laudo pericial',
    HEARING_MINUTES: 'ata de audiência',
    CONTRACT: 'contrato',
    POWER_OF_ATTORNEY: 'procuração',
    OTHER: 'outro',
    UNKNOWN: 'não classificado',
  };
  return map[kind] ?? 'não classificado';
}
