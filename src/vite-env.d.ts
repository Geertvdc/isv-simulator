/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The game server, e.g. `https://isv.example.com`; by default this page's host on port 2567. */
  readonly VITE_SERVER_URL?: string;
  /**
   * Several game servers (shards), comma-separated, in shard order (URL i is
   * shard i); wins over `VITE_SERVER_URL`.
   */
  readonly VITE_SERVER_URLS?: string;
}
