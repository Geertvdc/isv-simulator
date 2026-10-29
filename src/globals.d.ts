import type { SceneHandle } from './render/GameScene';
import type { NetDebug } from './render/scene/OnlineSession';

declare global {
  interface Window {
    /** Dev builds, while online: what the last frame drew (see `NetDebug`). */
    isvNet?: NetDebug;
    /** While a `?scene=` shows: whether it froze (see `SceneHandle`). */
    isvScene?: SceneHandle;
  }
}

export {};
