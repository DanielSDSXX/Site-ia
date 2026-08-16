import { z } from 'zod';

/**
 * Configuração da aplicação, validada uma única vez na primeira leitura.
 *
 * Regra: nenhuma chave de API aparece no código. Tudo vem de variáveis de
 * ambiente e nada com prefixo diferente de NEXT_PUBLIC_ chega ao browser.
 */

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET precisa ter ao menos 32 caracteres')
    .default('dev-insecure-session-secret-change-me-0123456789'),

  DATABASE_URL: z.string().min(1),

  VECTOR_DRIVER: z.enum(['pgvector', 'none']).default('pgvector'),

  AI_PROVIDER: z.enum(['anthropic', 'openai', 'google', 'local']).default('local'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(['openai', 'google', 'local']).default('local'),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com'),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  GOOGLE_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1beta'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./.data/storage'),
  STORAGE_ENCRYPTION_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanish.default(false),

  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(500).default(50),
  ALLOWED_UPLOAD_MIME: z
    .string()
    .default(
      'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg',
    ),

  OCR_PROVIDER: z.enum(['none', 'tesseract']).default('none'),
  OCR_LANG: z.string().default('por'),
  OCR_MAX_PAGES: z.coerce.number().int().positive().default(50),

  QUEUE_DRIVER: z.literal('database').default('database'),
  QUEUE_INLINE_WORKER: booleanish.default(true),
  QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),

  EMAIL_PROVIDER: z.enum(['none', 'resend', 'sendgrid', 'smtp']).default('none'),
  EMAIL_FROM: z.string().email().default('noreply@legalmind.local'),
  EMAIL_FROM_NAME: z.string().default('LegalMind AI'),
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  INVITE_BASE_URL: z.string().url().default('http://localhost:3000'),

  DATAJUD_ENABLED: booleanish.default(false),
  DATAJUD_API_KEY: z.string().optional(),
  DATAJUD_BASE_URL: z.string().url().default('https://api-publica.datajud.cnj.jus.br'),
  DATAJUD_TRIBUNAL_INDEX: z.string().default('api_publica_tjgo'),

  PAYMENT_PROVIDER: z.enum(['none', 'stripe', 'mercadopago']).default('none'),
  PAYMENT_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),

  RATE_LIMIT_ENABLED: booleanish.default(true),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${issues}\n\nConsulte .env.example.`);
  }
  cached = parsed.data;

  if (cached.NODE_ENV === 'production') {
    if (cached.SESSION_SECRET.startsWith('dev-')) {
      throw new Error('SESSION_SECRET padrão detectado em produção. Defina um segredo real.');
    }
  }
  return cached;
}

/** Apenas para testes: descarta o cache de configuração. */
export function resetEnvCache() {
  cached = null;
}

export function allowedUploadMimes(): string[] {
  return env()
    .ALLOWED_UPLOAD_MIME.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Resolve a chave de API do provedor de geração de texto configurado. */
export function aiApiKey(): string | undefined {
  const e = env();
  switch (e.AI_PROVIDER) {
    case 'anthropic':
      return e.ANTHROPIC_API_KEY || e.AI_API_KEY;
    case 'openai':
      return e.OPENAI_API_KEY || e.AI_API_KEY;
    case 'google':
      return e.GOOGLE_API_KEY || e.AI_API_KEY;
    default:
      return undefined;
  }
}

export function embeddingApiKey(): string | undefined {
  const e = env();
  switch (e.EMBEDDING_PROVIDER) {
    case 'openai':
      return e.OPENAI_API_KEY || e.EMBEDDING_API_KEY || e.AI_API_KEY;
    case 'google':
      return e.GOOGLE_API_KEY || e.EMBEDDING_API_KEY || e.AI_API_KEY;
    default:
      return undefined;
  }
}

/**
 * true quando a plataforma está rodando sem um LLM real conectado.
 * A interface usa isto para rotular explicitamente as saídas como
 * "modo demonstração" — nunca apresentamos análise heurística como se
 * fosse produzida por um modelo de linguagem.
 */
export function isDemoAI(): boolean {
  return env().AI_PROVIDER === 'local' || !aiApiKey();
}
