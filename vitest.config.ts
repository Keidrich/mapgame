import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@sim': dir('./sim'),
      '@content': dir('./content'),
      '@ui': dir('./ui'),
    },
  },
  test: { include: ['sim/**/*.test.ts'], environment: 'node' },
});
