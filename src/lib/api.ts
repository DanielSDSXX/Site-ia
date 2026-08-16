import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { ZodError, type z } from 'zod';
import { env } from '@/lib/env';
import { AppError, ForbiddenError, ValidationError, logError, toPublicError } from '@/lib/errors';

/**
 * Utilitários compartilhados pelos route handlers.
 *
 * Além de padronizar respostas, `handle()` centraliza duas defesas:
 *  - verificação de origem em requisições que alteram estado (anti-CSRF);
 *  - conversão de qualquer exceção numa resposta sem detalhes internos.
 */

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, { status: 200, ...init });
}

export function created<T>(data: T) {
  return NextResponse.json(data as object, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Anti-CSRF por verificação de origem.
 *
 * Cookies de sessão usam SameSite=Lax, o que já bloqueia envios cross-site
 * de formulários. Esta checagem cobre o caso restante (requisições fetch
 * disparadas por outra origem) comparando Origin/Referer com o host servido.
 */
export async function assertSameOrigin(request: Request): Promise<void> {
  if (!UNSAFE_METHODS.has(request.method)) return;

  const hdrs = await headers();
  const origin = hdrs.get('origin');
  const host = hdrs.get('host');
  if (!origin) {
    // Requisições same-origin de alguns clientes não enviam Origin;
    // aceitamos apenas se o Referer bater com o host.
    const referer = hdrs.get('referer');
    if (!referer) return;
    try {
      if (new URL(referer).host === host) return;
    } catch {
      /* referer malformado */
    }
    throw new ForbiddenError('Origem da requisição não reconhecida.');
  }

  const allowed = new Set<string>();
  if (host) allowed.add(host);
  try {
    allowed.add(new URL(env().APP_URL).host);
  } catch {
    /* APP_URL inválida é capturada na validação de env */
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError('Origem da requisição não reconhecida.');
  }

  if (!allowed.has(originHost)) {
    throw new ForbiddenError('Origem da requisição não reconhecida.');
  }
}

type Handler = () => Promise<Response> | Response;

/** Envolve um handler com verificação de origem e tratamento de erros. */
export async function handle(request: Request, scope: string, fn: Handler): Promise<Response> {
  try {
    await assertSameOrigin(request);
    return await fn();
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      const { status, body } = toPublicError(new ValidationError('Dados inválidos.', details));
      return NextResponse.json(body, { status });
    }
    if (!(err instanceof AppError) || err.status >= 500) {
      logError(scope, err, { url: request.url, method: request.method });
    }
    const { status, body } = toPublicError(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * Faz o parse do corpo JSON validando contra um schema Zod.
 * O tipo devolvido é a SAÍDA do schema (com defaults e transforms aplicados),
 * não a entrada — daí o uso de `z.output` em vez de `z.infer` genérico.
 */
export async function parseJson<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError('Corpo da requisição precisa ser JSON válido.');
  }
  return schema.parse(raw) as z.output<S>;
}

export function parseQuery<S extends z.ZodTypeAny>(request: Request, schema: S): z.output<S> {
  const url = new URL(request.url);
  const obj: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    obj[key] = all.length > 1 ? all : all[0];
  }
  return schema.parse(obj);
}

/** Identidade usada para rate limiting: usuário autenticado ou IP. */
export async function rateLimitIdentity(userId?: string | null): Promise<string> {
  if (userId) return `user:${userId}`;
  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0].trim() ?? hdrs.get('x-real-ip') ?? 'unknown';
  return `ip:${ip}`;
}
