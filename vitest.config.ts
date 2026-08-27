import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['tests/e2e/**', '**/dist/**', '**/node_modules/**'],
    coverage: {
      reporter: ['text', 'json-summary'],
    },
  },
});
