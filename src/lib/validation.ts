import { z } from 'zod';
import { isValidProcessNumber, normalizeProcessNumber } from './utils';

/**
 * Schemas de entrada.
 *
 * Toda escrita passa por aqui. Além de garantir tipos, este arquivo é onde
 * limitamos tamanho de texto — a primeira linha de defesa contra payloads
 * abusivos.
 */

export const emailSchema = z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(200);
export const nameSchema = z.string().trim().min(2, 'Informe o nome.').max(120);
export const idSchema = z.string().min(1).max(40);

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: z.string().min(10, 'A senha precisa ter ao menos 10 caracteres.').max(200),
  organizationName: z.string().trim().min(2, 'Informe o nome do escritório.').max(120),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'É necessário aceitar os termos de uso e a política de privacidade.' }),
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha.').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, 'A nova senha precisa ter ao menos 10 caracteres.').max(200),
});

// ---------------------------------------------------------------------------
// Processos
// ---------------------------------------------------------------------------

export const processNumberSchema = z
  .string()
  .trim()
  .min(5, 'Informe o número do processo.')
  .max(40)
  .transform(normalizeProcessNumber)
  .refine(
    (value) => {
      const digits = value.replace(/\D/g, '');
      // Aceita números fora do padrão CNJ (processos antigos, administrativos),
      // mas valida o dígito verificador quando o formato é CNJ.
      return digits.length !== 20 || isValidProcessNumber(value);
    },
    { message: 'O dígito verificador do número CNJ não confere.' },
  );

export const partyInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  role: z
    .enum(['PLAINTIFF', 'DEFENDANT', 'THIRD_PARTY', 'PROSECUTOR', 'JUDGE', 'LAWYER', 'EXPERT', 'WITNESS', 'OTHER'])
    .default('OTHER'),
  side: z.enum(['OURS', 'OPPOSING', 'NEUTRAL']).default('NEUTRAL'),
  documentId: z.string().trim().max(20).optional().nullable(),
  lawyerName: z.string().trim().max(200).optional().nullable(),
  oabNumber: z.string().trim().max(30).optional().nullable(),
});

export const createProcessSchema = z.object({
  number: processNumberSchema,
  court: z.string().trim().max(120).optional().nullable(),
  district: z.string().trim().max(120).optional().nullable(),
  courtUnit: z.string().trim().max(120).optional().nullable(),
  procedureClass: z.string().trim().max(160).optional().nullable(),
  subject: z.string().trim().max(200).optional().nullable(),
  clientId: idSchema.optional().nullable(),
  responsibleId: idSchema.optional().nullable(),
  caseValueCents: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  parties: z.array(partyInputSchema).max(20).default([]),
});

export const updateProcessSchema = createProcessSchema.partial().extend({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED', 'CLOSED']).optional(),
});

export const processFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED', 'CLOSED', 'ALL']).optional(),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']).optional(),
  clientId: idSchema.optional(),
  responsibleId: idSchema.optional(),
  deadlineSoon: z.coerce.boolean().optional(),
  noMovement: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  sort: z.enum(['recent', 'risk', 'deadline', 'number']).default('recent'),
});

// ---------------------------------------------------------------------------
// Clientes, tarefas, prazos
// ---------------------------------------------------------------------------

export const clientSchema = z.object({
  name: nameSchema,
  type: z.enum(['INDIVIDUAL', 'COMPANY']).default('INDIVIDUAL'),
  email: z.union([emailSchema, z.literal('')]).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const taskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  processId: idSchema.optional().nullable(),
  assigneeId: idSchema.optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELED']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.coerce.date().optional().nullable(),
});

export const updateTaskSchema = taskSchema.partial();

export const deadlineSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    processId: idSchema.optional().nullable(),
    responsibleId: idSchema.optional().nullable(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    legalBasis: z.string().trim().max(200).optional().nullable(),
    /** Ou informa a data final diretamente... */
    dueDate: z.coerce.date().optional().nullable(),
    /** ...ou pede o cálculo a partir da data-base. */
    baseDate: z.coerce.date().optional().nullable(),
    days: z.coerce.number().int().min(1).max(365).optional().nullable(),
    countingMode: z.enum(['BUSINESS_DAYS', 'CALENDAR_DAYS']).default('BUSINESS_DAYS'),
  })
  .refine((data) => Boolean(data.dueDate) || (Boolean(data.baseDate) && Boolean(data.days)), {
    message: 'Informe a data de vencimento ou a data-base junto com a quantidade de dias.',
    path: ['dueDate'],
  });

export const updateDeadlineSchema = z.object({
  status: z.enum(['OPEN', 'DONE', 'MISSED', 'CANCELED']).optional(),
  dueDate: z.coerce.date().optional(),
  responsibleId: idSchema.optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------

export const analysisRequestSchema = z.object({
  type: z.enum([
    'PROCESS_SUMMARY',
    'TIMELINE',
    'VULNERABILITIES',
    'ADVERSARIAL',
    'TRIAL_SIMULATION',
    'CONTRADICTIONS',
    'NEXT_ACTIONS',
    'EVIDENCE_MAP',
    'CLIENT_EXPLANATION',
    'STRUCTURE_EXTRACTION',
  ]),
  instructions: z.string().trim().max(2000).optional(),
  /** true = enfileira e retorna imediatamente; false = executa e aguarda. */
  async: z.boolean().default(true),
});

export const chatSchema = z.object({
  question: z.string().trim().min(2, 'Escreva uma pergunta.').max(2000),
  threadId: idSchema.optional().nullable(),
  verbosity: z.enum(['short', 'detailed']).default('detailed'),
  useOrgMemory: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Equipe, memória, jurisprudência
// ---------------------------------------------------------------------------

export const roleSchema = z.enum(['OWNER', 'ADMIN', 'LAWYER', 'ASSISTANT', 'VIEWER']);

export const inviteSchema = z.object({
  email: emailSchema,
  role: roleSchema.default('LAWYER'),
});

export const memoryItemSchema = z.object({
  kind: z.enum([
    'TEMPLATE',
    'THESIS',
    'BRIEF',
    'FAVORABLE_DECISION',
    'PREFERRED_JURISPRUDENCE',
    'STYLE_GUIDE',
    'STRATEGY',
    'INTERNAL_KNOWLEDGE',
  ]),
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(10).max(50_000),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
});

export const jurisprudenceImportSchema = z.object({
  court: z.string().trim().min(2).max(120),
  judgingBody: z.string().trim().max(160).optional().nullable(),
  caseNumber: z.string().trim().min(3).max(60),
  judgmentDate: z.coerce.date().optional().nullable(),
  reporter: z.string().trim().max(160).optional().nullable(),
  summary: z.string().trim().min(20, 'A ementa é obrigatória.').max(20_000),
  thesis: z.string().trim().max(4000).optional().nullable(),
  outcome: z.string().trim().max(200).optional().nullable(),
  excerpt: z.string().trim().max(10_000).optional().nullable(),
  sourceUrl: z.string().url('Informe a URL da fonte oficial.').max(500),
  sourceName: z.string().trim().min(2).max(200),
});

export const jurisprudenceSearchSchema = z.object({
  q: z.string().trim().min(3, 'Descreva o que você procura.').max(500),
  court: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ---------------------------------------------------------------------------
// Relatórios e busca
// ---------------------------------------------------------------------------

export const reportSchema = z.object({
  processId: idSchema,
  type: z.enum(['executive', 'client', 'internal', 'risk', 'full']),
  format: z.enum(['pdf', 'docx']).default('pdf'),
});

export const globalSearchSchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  allowExternalTraining: z.boolean().optional(),
  timezone: z.string().trim().max(60).optional(),
});
