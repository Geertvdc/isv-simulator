/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The game server, e.g. `https://isv.example.com`; by default this page's host on port 2567. */
  readonly VITE_SERVER_URL?: string;
}
