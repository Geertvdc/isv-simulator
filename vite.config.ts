import { defineConfig } from 'vitest/config';

// Machines allowed to open the dev server remotely (e.g. couch testing over the LAN).
const allowedHosts = ['herdr-geert'];

export default defineConfig({
  server: { allowedHosts },
  preview: { allowedHosts },
  // Phaser alone is ~1.4 MB minified; don't warn about it.
  build: { chunkSizeWarningLimit: 2000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
