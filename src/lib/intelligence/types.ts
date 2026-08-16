import { z } from 'zod';

/**
 * Contratos de saída das análises.
 *
 * Toda análise devolve dados estruturados — não texto livre — e cada
 * afirmação factual carrega `refs`, os identificadores dos trechos que a
 * sustentam. O validador de grounding rejeita refs inexistentes, de modo que
 * uma afirmação sem fonte válida nunca chega à tela como "documentada".
 */

export const severitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const confidenceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const sideSchema = z.enum(['OURS', 'OPPOSING', 'NEUTRAL']);

const refs = z.array(z.string()).default([]);

export const findingSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(3).max(4000),
  rationale: z.string().max(4000).optional().nullable(),
  suggestion: z.string().max(4000).optional().nullable(),
  severity: severitySchema.default('MEDIUM'),
  confidence: confidenceSchema.default('MEDIUM'),
  refs,
});
export type FindingOut = z.infer<typeof findingSchema>;

export const summarySchema = z.object({
  executiveSummary: z.string().min(10).max(4000),
  currentSituation: z.string().max(3000),
  probableNextStep: z.string().max(2000),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']).default('UNKNOWN'),
  riskScore: z.number().int().min(0).max(100).default(50),
  riskRationale: z.string().max(3000).default(''),
  keyPoints: z.array(z.object({ text: z.string().max(600), refs })).default([]),
  confidence: confidenceSchema.default('MEDIUM'),
});
export type SummaryOut = z.infer<typeof summarySchema>;

export const timelineSchema = z.object({
  events: z
    .array(
      z.object({
        date: z.string(), // ISO ou dd/mm/aaaa
        type: z.string().max(80),
        title: z.string().max(200),
        description: z.string().max(1500).optional().nullable(),
        importance: severitySchema.default('MEDIUM'),
        refs,
      }),
    )
    .default([]),
});
export type TimelineOut = z.infer<typeof timelineSchema>;

export const vulnerabilitiesSchema = z.object({
  findings: z.array(findingSchema).default([]),
  overallAssessment: z.string().max(3000).default(''),
  confidence: confidenceSchema.default('MEDIUM'),
});
export type VulnerabilitiesOut = z.infer<typeof vulnerabilitiesSchema>;

export const adversarialSchema = z.object({
  opponentArguments: z.array(findingSchema).default([]),
  counterArguments: z.array(findingSchema).default([]),
  likelyQuestions: z.array(z.string().max(600)).default([]),
  confidence: confidenceSchema.default('MEDIUM'),
});
export type AdversarialOut = z.infer<typeof adversarialSchema>;

export const trialSimulationSchema = z.object({
  plaintiffPoints: z.array(findingSchema).default([]),
  defendantPoints: z.array(findingSchema).default([]),
  controversialIssues: z.array(findingSchema).default([]),
  decisiveEvidence: z.array(z.object({ text: z.string().max(600), refs })).default([]),
  clarificationsNeeded: z.array(z.string().max(600)).default([]),
  confidence: confidenceSchema.default('MEDIUM'),
});
export type TrialSimulationOut = z.infer<typeof trialSimulationSchema>;

export const contradictionsSchema = z.object({
  contradictions: z
    .array(
      z.object({
        title: z.string().max(200),
        description: z.string().max(2000),
        severity: severitySchema.default('MEDIUM'),
        confidence: confidenceSchema.default('MEDIUM'),
        sideA: z.object({ ref: z.string(), quote: z.string().max(1200) }),
        sideB: z.object({ ref: z.string(), quote: z.string().max(1200) }),
      }),
    )
    .default([]),
});
export type ContradictionsOut = z.infer<typeof contradictionsSchema>;

export const nextActionsSchema = z.object({
  actions: z
    .array(
      z.object({
        title: z.string().max(200),
        description: z.string().max(2000),
        rationale: z.string().max(2000).optional().nullable(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
        refs,
      }),
    )
    .default([]),
  confidence: confidenceSchema.default('MEDIUM'),
});
export type NextActionsOut = z.infer<typeof nextActionsSchema>;

export const evidenceMapSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().max(1000),
        kind: z.enum(['FACT', 'ALLEGATION', 'REQUEST', 'THESIS', 'DEFENSE']).default('ALLEGATION'),
        side: sideSchema.default('NEUTRAL'),
        strength: z.enum(['NONE', 'WEAK', 'MODERATE', 'STRONG']).default('NONE'),
        strengthRationale: z.string().max(1500).default(''),
        supporting: z.array(z.object({ ref: z.string(), note: z.string().max(500).default('') })).default([]),
        contradicting: z.array(z.object({ ref: z.string(), note: z.string().max(500).default('') })).default([]),
      }),
    )
    .default([]),
  gaps: z.array(z.object({ claim: z.string().max(1000), note: z.string().max(1000) })).default([]),
});
export type EvidenceMapOut = z.infer<typeof evidenceMapSchema>;

export const structureSchema = z.object({
  parties: z
    .array(
      z.object({
        name: z.string().max(200),
        role: z
          .enum(['PLAINTIFF', 'DEFENDANT', 'THIRD_PARTY', 'PROSECUTOR', 'JUDGE', 'LAWYER', 'EXPERT', 'WITNESS', 'OTHER'])
          .default('OTHER'),
        side: sideSchema.default('NEUTRAL'),
        refs,
      }),
    )
    .default([]),
  claims: z
    .array(
      z.object({
        text: z.string().max(1000),
        kind: z.enum(['FACT', 'ALLEGATION', 'REQUEST', 'THESIS', 'DEFENSE']).default('ALLEGATION'),
        side: sideSchema.default('NEUTRAL'),
        refs,
      }),
    )
    .default([]),
  legalIssues: z.array(z.object({ title: z.string().max(300), description: z.string().max(1500).default(''), refs })).default([]),
});
export type StructureOut = z.infer<typeof structureSchema>;

export const clientExplanationSchema = z.object({
  text: z.string().min(10).max(6000),
  glossary: z.array(z.object({ term: z.string().max(120), meaning: z.string().max(600) })).default([]),
});
export type ClientExplanationOut = z.infer<typeof clientExplanationSchema>;

/** Metadados anexados a toda análise, independentemente do tipo. */
export interface AnalysisMeta {
  /** true quando produzida sem LLM (motor heurístico). */
  demo: boolean;
  provider: string;
  model: string;
  chunkIdsUsed: string[];
  /** Refs citados pelo modelo que não existiam no contexto (descartados). */
  droppedRefs: string[];
  contextTruncated: boolean;
  generatedAt: string;
}
