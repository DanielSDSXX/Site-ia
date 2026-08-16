import { PrismaClient } from '@prisma/client';

/**
 * Instância única do Prisma. Em desenvolvimento o hot-reload do Next recria
 * módulos com frequência; guardamos o client em globalThis para não estourar
 * o pool de conexões do Postgres.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { Prisma } from '@prisma/client';
