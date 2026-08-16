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
        },
      },
    };
  }
  return { status: 500, body: { error: { code: 'internal_error', message: GENERIC_MESSAGE } } };
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
