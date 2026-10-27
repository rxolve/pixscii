import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['src/node/test-setup.ts'],
  },
});
