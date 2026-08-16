import { execFileSync } from 'node:child_process';
import { config } from 'dotenv';

config();

/**
 * Preparação do banco de testes.
 *
 * Este arquivo roda ANTES de qualquer módulo de teste, o que é essencial:
 * `src/lib/db.ts` lê DATABASE_URL no momento do import, então a troca para o
 * banco de teste precisa acontecer aqui.
 */

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL não configurada. Os testes de integração exigem um banco PostgreSQL separado — veja .env.example.',
  );
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL não pode ser igual a DATABASE_URL: os testes apagam dados.');
}

process.env.DATABASE_URL = testUrl;
// NODE_ENV é somente-leitura nos tipos do Node; a atribuição em runtime é
// intencional para que a validação de ambiente não exija segredos de produção.
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.AI_PROVIDER = 'local';
process.env.EMBEDDING_PROVIDER = 'local';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = './.data/test-storage';
process.env.QUEUE_INLINE_WORKER = 'false';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.SESSION_SECRET = 'test-secret-com-mais-de-32-caracteres-para-passar-na-validacao';

// Aplica as migrações no banco de teste (idempotente).
execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: testUrl },
  stdio: 'pipe',
});
