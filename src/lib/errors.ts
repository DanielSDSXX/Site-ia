/**
 * Erros de aplicação.
 *
 * Regra de produto (item 62 do briefing): o usuário nunca vê um stack trace.
 * Só erros marcados como `expose` têm sua mensagem exibida; todo o resto vira
 * uma mensagem genérica e é registrado internamente.
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor(
    message: string,
    opts: { status?: number; code?: string; expose?: boolean; details?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = opts.status ?? 500;
    this.code = opts.code ?? 'internal_error';
    this.expose = opts.expose ?? this.status < 500;
    this.details = opts.details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos.', details?: unknown) {
    super(message, { status: 422, code: 'validation_error', expose: true, details });
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Sessão expirada ou inexistente. Entre novamente.') {
    super(message, { status: 401, code: 'unauthorized', expose: true });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Você não tem permissão para esta ação.') {
    super(message, { status: 403, code: 'forbidden', expose: true });
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Registro não encontrado.') {
    super(message, { status: 404, code: 'not_found', expose: true });
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Muitas requisições. Aguarde um instante e tente novamente.') {
    super(message, { status: 429, code: 'rate_limited', expose: true });
    this.name = 'RateLimitError';
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'Limite do plano atingido.') {
    super(message, { status: 402, code: 'quota_exceeded', expose: true });
    this.name = 'QuotaExceededError';
  }
}

export class AIProviderError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { status: 502, code: 'ai_provider_error', expose: false, details });
    this.name = 'AIProviderError';
  }
}

const GENERIC_MESSAGE = 'Não conseguimos concluir a operação. Tente novamente em instantes.';

export interface PublicErrorShape {
  error: { code: string; message: string; details?: unknown };
}

/**
 * Detalhe técnico do erro — SOMENTE em desenvolvimento.
 *
 * Em produção o usuário nunca vê stack, nome de tabela ou host de banco: isso
 * vaza infraestrutura e não ajuda ninguém. Mas em desenvolvimento a mensagem
 * genérica esconde justamente o que o desenvolvedor precisa — "não
 * conseguimos concluir a operação" pode ser banco fora do ar, migração
 * pendente ou seed ausente, e não havia como distinguir sem ler o terminal.
 */
function developmentHint(err: unknown): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const message = err instanceof Error ? err.message : String(err);
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  /*
    A primeira linha costuma ser só cabeçalho. O Prisma, por exemplo, abre com
    "Invalid `prisma.$queryRaw()` invocation:" e só depois diz o que houve
    ("Can't reach database server at 127.0.0.1:5432") — que é a linha que
    resolve o problema. Pulamos as linhas terminadas em dois-pontos.
  */
  const informative = lines.find((line) => !line.endsWith(':')) ?? lines[0] ?? '';
  return informative ? `[dev] ${informative.slice(0, 300)}` : null;
}

/** Converte qualquer erro numa resposta segura para o cliente. */
export function toPublicError(err: unknown): { status: number; body: PublicErrorShape } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.expose ? err.message : GENERIC_MESSAGE,
          ...(err.expose && err.details ? { details: err.details } : {}),
          ...(err.expose ? {} : hintField(err)),
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'internal_error', message: GENERIC_MESSAGE, ...hintField(err) } },
  };
}

function hintField(err: unknown): { details?: unknown } {
  const hint = developmentHint(err);
  return hint ? { details: hint } : {};
}

/** Log interno estruturado — nunca exposto ao usuário. */
export function logError(scope: string, err: unknown, context: Record<string, unknown> = {}) {
  const payload = {
    scope,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ...context,
  };
  console.error('[legalmind]', JSON.stringify(payload));
}
