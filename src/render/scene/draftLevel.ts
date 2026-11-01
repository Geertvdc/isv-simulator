/**
 * The greybox loader of the level redesign (phase 23), dev builds only:
 * `?draft=<level-id>[&phase=<N>]` plays `maps/drafts/<level-id>.txt` (or its
 * reorg phase `<level-id>.phase<N>.txt`) with that level's settings. `main.ts`
 * imports this module behind `import.meta.env.DEV`, so production builds
 * leave it and the drafts out.
 */

import { draftFileName, draftLevel, draftRequest } from '../../sim/draftMap';
import { type Level, levelById } from '../../sim/levels';
import { LEVEL_IDS } from './campaign';

// Lazy: only the asked-for draft is fetched. Vite picks up new draft files on its own.
const DRAFTS = import.meta.glob<string>('../../../maps/drafts/*.txt', {
  query: '?raw',
  import: 'default',
});

/** The draft level the URL asks for, `null` without `?draft=`; warns and returns `null` if it can't. */
export async function loadDraftLevel(params: URLSearchParams): Promise<Level | null> {
  const request = draftRequest(params.get('draft'), params.get('phase'), LEVEL_IDS);
  if (request === null) return null;
  if ('error' in request) {
    console.warn(`?draft: ${request.error}`);
    return null;
  }
  const file = draftFileName(request.id, request.phase);
  const load = DRAFTS[`../../../maps/drafts/${file}`];
  const level = levelById(request.id);
  if (!load || !level) {
    console.warn(`?draft: no maps/drafts/${file}`);
    return null;
  }
  return draftLevel(level, await load());
}
