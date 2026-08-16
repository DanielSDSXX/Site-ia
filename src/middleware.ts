import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware leve.
 *
 * Roda no edge runtime, então não toca banco nem criptografia: apenas
 * redireciona quem claramente não tem sessão e aplica a CSP. A verificação
 * real da sessão acontece no servidor, em cada layout e route handler — o
 * middleware é conveniência de navegação, nunca a fronteira de segurança.
 */

const SESSION_COOKIE = 'lm_session';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/processos',
  '/documentos',
  '/inteligencia',
  '/prazos',
  '/tarefas',
  '/jurisprudencia',
  '/relatorios',
  '/clientes',
  '/equipe',
  '/configuracoes',
  '/admin',
];

/**
 * CSP sem 'unsafe-eval'. `unsafe-inline` em script-src é necessário para o
 * script de tema que roda antes da hidratação e para o runtime do Next em
 * desenvolvimento; em produção o Next usa nonces para os próprios scripts.
 */
function contentSecurityPolicy(isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  response.headers.set(
    'Content-Security-Policy',
    contentSecurityPolicy(process.env.NODE_ENV === 'development'),
  );
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|pdf.worker.min.mjs).*)'],
};
