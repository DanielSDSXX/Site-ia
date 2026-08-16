import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config();

/**
 * Testes de integração: rodam contra um PostgreSQL real (TEST_DATABASE_URL).
 * São sequenciais porque compartilham o mesmo banco, que é limpo entre suítes.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globals: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    setupFiles: ['tests/integration/setup.ts'],
  },
});
