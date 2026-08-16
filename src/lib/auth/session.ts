import { cookies, headers } from 'next/headers';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { hashIp, randomToken, sha256 } from '@/lib/security/crypto';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';
import { can, type Permission } from './permissions';

export const SESSION_COOKIE = 'lm_session';
const SESSION_TTL_DAYS = 14;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  isPlatformAdmin: boolean;
}

export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
  allowExternalTraining: boolean;
}

export interface AuthContext {
  sessionId: string;
  user: SessionUser;
  organization: SessionOrganization;
  role: Role;
  can: (permission: Permission) => boolean;
}

// ---------------------------------------------------------------------------
// Criação / destruição
// ---------------------------------------------------------------------------

export async function createSession(userId: string, organizationId: string | null) {
  const token = randomToken(32);
  const hdrs = await headers();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await prisma.session.create({
    data: {
      userId,
      organizationId,
      tokenHash: sha256(token),
      userAgent: hdrs.get('user-agent')?.slice(0, 300) ?? null,
      ipHash: hashIp(clientIpFromHeaders(hdrs)),
      expiresAt,
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(SESSION_COOKIE);
}

/** Troca a organização ativa da sessão corrente. */
export async function switchOrganization(sessionId: string, organizationId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { organizationId } });
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Resolve a sessão atual. Retorna null quando não há sessão válida —
 * nunca lança, para que páginas públicas possam chamá-la livremente.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.deletedAt) return null;

  const memberships = session.user.memberships.filter((m) => !m.organization.deletedAt);
  if (memberships.length === 0) return null;

  const active =
    memberships.find((m) => m.organizationId === session.organizationId) ?? memberships[0];

  // Renova `lastSeenAt` no máximo a cada 5 minutos para evitar escrita por request.
  if (Date.now() - session.lastSeenAt.getTime() > 300_000) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      avatarColor: session.user.avatarColor,
      isPlatformAdmin: session.user.isPlatformAdmin,
    },
    organization: {
      id: active.organization.id,
      name: active.organization.name,
      slug: active.organization.slug,
      allowExternalTraining: active.organization.allowExternalTraining,
    },
    role: active.role,
    can: (permission: Permission) => can(active.role, permission),
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.can(permission)) {
    throw new ForbiddenError(
      `Seu perfil (${ctx.role}) não permite esta ação. Fale com um administrador do escritório.`,
    );
  }
  return ctx;
}

export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.user.isPlatformAdmin) throw new ForbiddenError('Área restrita à administração da plataforma.');
  return ctx;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function clientIpFromHeaders(hdrs: Headers): string | null {
  const forwarded = hdrs.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return hdrs.get('x-real-ip');
}

export async function listUserOrganizations(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, organization: { deletedAt: null } },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  });
  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role,
  }));
}
