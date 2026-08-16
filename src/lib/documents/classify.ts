import { DocumentKind } from '@prisma/client';
import { countTerms, extractDates, normalizeText } from '@/lib/text/nlp';

/**
 * Classificação de peças processuais por evidência lexical.
 *
 * É uma heurística explícita e auditável — cada tipo tem um conjunto de termos
 * característicos e vence quem somar mais ocorrências ponderadas. Não é
 * "IA": é contagem de termos, e o resultado sempre pode ser corrigido à mão
 * pelo usuário na tela do documento.
 */

interface KindSignature {
  kind: DocumentKind;
  /** Termos fortes: praticamente definem a peça. */
  strong: string[];
  /** Termos de apoio. */
  weak: string[];
}

const SIGNATURES: KindSignature[] = [
  {
    kind: DocumentKind.INITIAL_PETITION,
    strong: ['petição inicial', 'vem propor', 'propor a presente ação', 'requer a citação'],
    weak: ['dos fatos', 'do direito', 'dos pedidos', 'valor da causa', 'distribuição'],
  },
  {
    kind: DocumentKind.ANSWER,
    strong: ['contestação', 'apresentar contestação', 'preliminarmente', 'impugna'],
    weak: ['ilegitimidade passiva', 'inépcia', 'no mérito', 'improcedência', 'litisconsórcio'],
  },
  {
    kind: DocumentKind.REPLY,
    strong: ['réplica', 'impugnação à contestação', 'manifestação sobre a contestação'],
    weak: ['reitera', 'ratifica os termos'],
  },
  {
    kind: DocumentKind.SENTENCE,
    strong: ['sentença', 'julgo procedente', 'julgo improcedente', 'julgo parcialmente', 'dispositivo'],
    weak: ['publique-se', 'registre-se', 'intimem-se', 'resolvo o mérito', 'condeno'],
  },
  {
    kind: DocumentKind.DECISION,
    strong: ['decisão interlocutória', 'defiro', 'indefiro', 'decido', 'despacho saneador'],
    weak: ['intime-se', 'tutela de urgência', 'liminar', 'concedo'],
  },
  {
    kind: DocumentKind.APPEAL,
    strong: ['apelação', 'agravo de instrumento', 'recurso especial', 'embargos de declaração', 'razões recursais'],
    weak: ['reforma da sentença', 'preparo', 'tempestividade'],
  },
  {
    kind: DocumentKind.EXPERT_REPORT,
    strong: ['laudo pericial', 'perito judicial', 'quesitos'],
    weak: ['conclusão pericial', 'vistoria', 'metodologia'],
  },
  {
    kind: DocumentKind.HEARING_MINUTES,
    strong: ['ata de audiência', 'termo de audiência', 'audiência de instrução'],
    weak: ['depoimento pessoal', 'oitiva', 'testemunha', 'conciliação'],
  },
  {
    kind: DocumentKind.CONTRACT,
    strong: ['contrato de', 'cláusula primeira', 'instrumento particular'],
    weak: ['contratante', 'contratada', 'vigência', 'rescisão'],
  },
  {
    kind: DocumentKind.POWER_OF_ATTORNEY,
    strong: ['procuração', 'outorga poderes', 'ad judicia'],
    weak: ['outorgante', 'outorgado', 'substabelecer'],
  },
  {
    kind: DocumentKind.EVIDENCE,
    strong: ['comprovante', 'nota fiscal', 'extrato', 'fatura', 'boletim de ocorrência'],
    weak: ['recibo', 'protocolo', 'print', 'screenshot'],
  },
];

export interface ClassificationResult {
  kind: DocumentKind;
  confidence: number;
  matchedTerms: string[];
}

export function classifyDocument(text: string, filename = ''): ClassificationResult {
  // Analisa o começo do documento: é onde a peça se identifica.
  const head = text.slice(0, 8000);
  const haystack = `${filename}\n${head}`;

  let best: ClassificationResult = { kind: DocumentKind.UNKNOWN, confidence: 0, matchedTerms: [] };

  for (const signature of SIGNATURES) {
    const matched: string[] = [];
    let score = 0;

    for (const term of signature.strong) {
      const count = countTerms(haystack, [term]);
      if (count > 0) {
        score += 3 * Math.min(count, 3);
        matched.push(term);
      }
    }
    for (const term of signature.weak) {
      const count = countTerms(haystack, [term]);
      if (count > 0) {
        score += Math.min(count, 3);
        matched.push(term);
      }
    }

    if (score > best.confidence) {
      best = { kind: signature.kind, confidence: score, matchedTerms: matched };
    }
  }

  // Abaixo de 3 pontos a evidência é fraca demais para afirmar um tipo.
  if (best.confidence < 3) {
    return { kind: DocumentKind.UNKNOWN, confidence: best.confidence, matchedTerms: best.matchedTerms };
  }
  return best;
}

/**
 * Tenta identificar a data do documento: procura padrões de fecho
 * ("Goiânia, 12 de março de 2026") e, na falta, a última data do cabeçalho.
 */
export function guessDocumentDate(text: string): Date | null {
  const tail = text.slice(-3000);
  const normalized = normalizeText(tail);

  const closing = normalized.match(/[a-zçãéíóú\s]+,\s*(\d{1,2}\s+de\s+[a-z]+\s+de\s+\d{4})/);
  if (closing) {
    const dates = extractDates(closing[1]);
    if (dates.length > 0) return dates[0].date;
  }

  const dates = extractDates(tail);
  if (dates.length > 0) return dates[dates.length - 1].date;

  const headDates = extractDates(text.slice(0, 2000));
  return headDates.length > 0 ? headDates[0].date : null;
}

export const KIND_LABELS: Record<DocumentKind, string> = {
  INITIAL_PETITION: 'Petição inicial',
  ANSWER: 'Contestação',
  REPLY: 'Réplica',
  DECISION: 'Decisão',
  SENTENCE: 'Sentença',
  APPEAL: 'Recurso',
  EVIDENCE: 'Prova documental',
  EXPERT_REPORT: 'Laudo pericial',
  HEARING_MINUTES: 'Ata de audiência',
  CONTRACT: 'Contrato',
  POWER_OF_ATTORNEY: 'Procuração',
  OTHER: 'Outro',
  UNKNOWN: 'Não classificado',
};
