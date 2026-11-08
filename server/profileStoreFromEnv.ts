/**
 * Which profile store the server uses, from the env vars:
 *
 * - `PROFILE_STORE=file` (the default): `JsonFileProfileStore` at
 *   `PROFILE_STORE_PATH` (or `data/profiles.json`). One server only.
 * - `PROFILE_STORE=table`: `TableProfileStore` (Azure Table Storage), which
 *   every shard shares; see `tableProfileStoreFromEnv` for its settings.
 */

import {
  DEFAULT_PROFILE_STORE_PATH,
  JsonFileProfileStore,
  type ProfileStore,
} from './profileStore';
import { tableProfileStoreFromEnv } from './tableProfileStore';

/** Throws, saying what's wrong, on an unknown `PROFILE_STORE` or missing table settings. */
export function profileStoreFromEnv(env: NodeJS.ProcessEnv = process.env): ProfileStore {
  const kind = env.PROFILE_STORE?.trim().toLowerCase() || 'file';
  if (kind === 'file') {
    return new JsonFileProfileStore(env.PROFILE_STORE_PATH || DEFAULT_PROFILE_STORE_PATH);
  }
  if (kind === 'table') return tableProfileStoreFromEnv(env);
  throw new Error(`PROFILE_STORE must be "file" or "table", got "${env.PROFILE_STORE}"`);
}
