import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { handle, ok, parseJson, rateLimitIdentity } from '@/lib/api';
import { loginSchema } from '@/lib/validation';
import { verifyPassword } from '@/lib/auth/password';
import { clientIpFromHeaders, createSession } from '@/lib/auth/session';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { hashIp } from '@/lib/security/crypto';
import { AppError } from '@/lib/errors';
import { audit } from '@/lib/audit';

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export async function POST(request: Request) {
  return handle(request, 'auth.login', async () => {
    const input = await parseJson(request, loginSchema);

    // Dois limites: por IP (força bruta distribuída) e por e-mail (alvo único).
    await enforceRateLimit(RATE_LIMITS.login, await rateLimitIdentity());
    await enforceRateLimit(RATE_LIMITS.login, `email:${input.email}`);

    const hdrs = await headers();
    const ipHash = hashIp(clientIpFromHeaders(hdrs));

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { memberships: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });

    const invalid = new AppError('E-mail ou senha incorretos.', {
      status: 401,
      code: 'invalid_credentials',
      expose: true,
    });

    if (!user || user.deletedAt) {
      // Executa uma verificação fictícia para não vazar existência da conta
      // por diferença de tempo de resposta.
      await verifyPassword(input.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
      await audit({ action: 'auth.login_failed', ipHash, metadata: { reason: 'unknown_user' } });
      throw invalid;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(
        `Conta temporariamente bloqueada por tentativas de acesso. Tente novamente após ${user.lockedUntil.toLocaleTimeString('pt-BR')}.`,
        { status: 423, code: 'account_locked', expose: true },
      );
    }

    if (!(await verifyPassword(input.password, user.passwordHash))) {
      const failedLoginCount = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          lockedUntil:
            failedLoginCount >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCK_MINUTES * 60_000)
              : null,
        },
      });
      await audit({
        action: 'auth.login_failed',
        userId: user.id,
        ipHash,
        metadata: { attempt: failedLoginCount },
      });
      throw invalid;
    }

    if (user.memberships.length === 0) {
      throw new AppError('Sua conta não está vinculada a nenhum escritório.', {
        status: 403,
        code: 'no_organization',
        expose: true,
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const organizationId = user.memberships[0].organizationId;
    await createSession(user.id, organizationId);

    await audit({
      action: 'auth.login',
      userId: user.id,
      organizationId,
      ipHash,
      userAgent: hdrs.get('user-agent'),
    });

    return ok({ user: { id: user.id, name: user.name, email: user.email } });
  });
}
