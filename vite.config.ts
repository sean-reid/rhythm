import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    passWithNoTests: true,
  },
});
