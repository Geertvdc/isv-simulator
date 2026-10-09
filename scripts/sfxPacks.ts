/** The CC0 sound packs we pick sound effects from. */

export interface SoundPack {
  /** Folder name under `sfx-candidates/`. */
  id: string;
  name: string;
  page: string;
  zip: string;
}

export const SOUND_PACKS: readonly SoundPack[] = [
  {
    id: 'interface-sounds',
    name: 'Interface Sounds',
    page: 'https://kenney.nl/assets/interface-sounds',
    zip: 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
  },
  {
    id: 'impact-sounds',
    name: 'Impact Sounds',
    page: 'https://kenney.nl/assets/impact-sounds',
    zip: 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
  },
  {
    id: 'digital-audio',
    name: 'Digital Audio',
    page: 'https://kenney.nl/assets/digital-audio',
    zip: 'https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip',
  },
];

/** Where each game sound came from: pack id and the file name inside the pack. */
export type SoundSources = Record<string, { pack: string; file: string }>;
