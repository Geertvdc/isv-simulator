import { defineConfig } from 'vite';

/**
 * Bundles the game server (`server/main.ts`) for production into
 * `dist-server/main.js`: our code, with the `?raw` level maps inlined, while
 * packages from node_modules (Colyseus) stay external. `npm run build:server`.
 */
export default defineConfig({
  build: {
    ssr: 'server/main.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: true,
  },
});
