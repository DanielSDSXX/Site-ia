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

/*
  As mensagens vão escritas uma a uma, em português.

  Sem elas o Zod devolve o texto padrão em inglês ("String must contain at
  least 2 character(s)"), que na importação em lote chega direto à tela, ao
  lado do número da linha — o usuário lê um erro técnico em outro idioma para
  descobrir que faltou preencher a fonte.
*/
export const jurisprudenceImportSchema = z.object({
  court: z
    .string()
    .trim()
    .min(2, 'Informe o tribunal.')
    .max(120, 'O tribunal deve ter no máximo 120 caracteres.'),
  judgingBody: z
    .string()
    .trim()
    .max(160, 'O órgão julgador deve ter no máximo 160 caracteres.')
    .optional()
    .nullable(),
  caseNumber: z
    .string()
    .trim()
    .min(3, 'Informe o número do processo.')
    .max(60, 'O número do processo deve ter no máximo 60 caracteres.'),
  judgmentDate: z.coerce
    .date({ invalid_type_error: 'Data inválida. Use 11/03/2026 ou 2026-03-11.' })
    .optional()
    .nullable(),
  reporter: z
    .string()
    .trim()
    .max(160, 'O nome do relator deve ter no máximo 160 caracteres.')
    .optional()
    .nullable(),
  summary: z
    .string()
    .trim()
    .min(20, 'A ementa é obrigatória e precisa ter ao menos 20 caracteres.')
    .max(20_000, 'A ementa passou de 20.000 caracteres.'),
  thesis: z
    .string()
    .trim()
    .max(4000, 'A tese deve ter no máximo 4.000 caracteres.')
    .optional()
    .nullable(),
  outcome: z
    .string()
    .trim()
    .max(200, 'O resultado deve ter no máximo 200 caracteres.')
    .optional()
    .nullable(),
  excerpt: z
    .string()
    .trim()
    .max(10_000, 'O trecho deve ter no máximo 10.000 caracteres.')
    .optional()
    .nullable(),
  sourceUrl: z
    .string()
    .url('Informe a URL da fonte oficial.')
    .max(500, 'A URL deve ter no máximo 500 caracteres.'),
  sourceName: z
    .string()
    .trim()
    .min(2, 'Informe o nome da fonte (ex.: Portal do TJGO).')
    .max(200, 'O nome da fonte deve ter no máximo 200 caracteres.'),
});

export const jurisprudenceSearchSchema = z.object({
  q: z.string().trim().min(3, 'Descreva o que você procura.').max(500),
  court: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  /**
   * Inclui na busca os registros marcados como demonstração. Desligado por
   * padrão: o acervo de trabalho só devolve decisões com fonte oficial.
   */
  includeDemo: z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
    )
    .default(false),
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
