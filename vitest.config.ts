import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@sim': dir('./sim'),
      '@content': dir('./content'),
      '@ui': dir('./ui'),
      '@geo': dir('./geo'),
    },
  },
  // ui tests render components with react-dom/server: a sheet that throws is a black screen,
  // so they run in the same suite as the sim's
  test: { include: ['sim/**/*.test.ts', 'geo/**/*.test.ts', 'ui/**/*.test.tsx', 'ui/**/*.test.ts'], environment: 'node' },
});
