import { defineConfig } from 'vitest/config';

// Machines allowed to open the dev server remotely (e.g. couch testing over the LAN).
const allowedHosts = ['herdr-geert'];

export default defineConfig({
  // PORT lets a preview tool pick a free port when several dev servers run at once.
  server: { allowedHosts, port: Number(process.env.PORT) || 5173, strictPort: !!process.env.PORT },
  preview: { allowedHosts },
  // Phaser and three.js together are ~2.7 MB minified; don't warn about it.
  build: { chunkSizeWarningLimit: 3000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'scripts/**/*.test.ts'],
    // The character rig tests build and pose many full models; CI runners are several times
    // slower than a dev laptop, so the 5s default fails there while passing locally.
    testTimeout: 30_000,
  },
});
