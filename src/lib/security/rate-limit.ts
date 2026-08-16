import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { RateLimitError } from '@/lib/errors';
import { sha256 } from './crypto';

/**
 * Rate limiting por janela fixa, persistido no PostgreSQL.
 *
 * Escolhemos o banco em vez de memória porque a aplicação pode rodar em
 * múltiplas instâncias (serverless incluído) — um limite em memória seria
 * contornável simplesmente batendo em outra instância.
 */

export interface RateLimitRule {
  /** Identificador da regra, ex.: 'auth:login'. */
  name: string;
  /** Máximo de requisições permitidas na janela. */
  limit: number;
  /** Duração da janela em segundos. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  login: { name: 'auth:login', limit: 8, windowSeconds: 300 },
  register: { name: 'auth:register', limit: 5, windowSeconds: 3600 },
  upload: { name: 'document:upload', limit: 60, windowSeconds: 3600 },
  analysis: { name: 'ai:analysis', limit: 40, windowSeconds: 3600 },
  chat: { name: 'ai:chat', limit: 120, windowSeconds: 3600 },
  search: { name: 'search', limit: 300, windowSeconds: 3600 },
  mutation: { name: 'api:mutation', limit: 600, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(rule: RateLimitRule, identity: string): Promise<RateLimitResult> {
  const now = new Date();
  if (!env().RATE_LIMIT_ENABLED) {
    return { allowed: true, remaining: rule.limit, resetAt: now };
  }

  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const key = sha256(`${rule.name}:${identity}:${windowStart}`);
  const expiresAt = new Date(windowStart + windowMs);

  // upsert atômico: o INSERT ... ON CONFLICT DO UPDATE incrementa sem corrida.
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limit_buckets" ("key", "count", "expiresAt")
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE
      SET "count" = "rate_limit_buckets"."count" + 1
    RETURNING "count"
  `;

  const count = rows[0]?.count ?? 1;
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt: expiresAt,
  };
}

export async function enforceRateLimit(rule: RateLimitRule, identity: string): Promise<void> {
  const result = await checkRateLimit(rule, identity);
  if (!result.allowed) {
    const seconds = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
    throw new RateLimitError(
      `Muitas tentativas. Tente novamente em ${seconds > 60 ? `${Math.ceil(seconds / 60)} minuto(s)` : `${seconds} segundo(s)`}.`,
    );
  }
}

/** Remove janelas expiradas. Chamado periodicamente pelo worker. */
export async function pruneRateLimitBuckets(): Promise<number> {
  const { count } = await prisma.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
