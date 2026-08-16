import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/** Testes unitários: lógica pura, sem banco nem rede. */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
});
