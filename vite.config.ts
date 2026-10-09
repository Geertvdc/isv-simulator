import { defineConfig } from 'vitest/config';

// Machines allowed to open the dev server remotely (e.g. couch testing over the LAN).
const allowedHosts = ['herdr-geert'];

export default defineConfig({
  // PORT lets a preview tool pick a free port when several dev servers run at once.
  server: { allowedHosts, port: Number(process.env.PORT) || 5173, strictPort: !!process.env.PORT },
  preview: { allowedHosts },
  // Phaser alone is ~1.4 MB minified; don't warn about it.
  build: { chunkSizeWarningLimit: 2000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
