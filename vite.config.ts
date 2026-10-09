import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Phaser alone is ~1.2 MB minified; don't warn about it.
  build: { chunkSizeWarningLimit: 2000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
