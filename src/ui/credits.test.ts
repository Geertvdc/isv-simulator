import { describe, expect, it } from 'vitest';
import credits from '../../CREDITS.md?raw';
import { parseCredits, plainText } from './credits';

describe('plainText', () => {
  it('drops links, emphasis and code marks', () => {
    expect(plainText('**Sprites** (`a/b`): by [Kenney](https://kenney.nl), ![x](y.png)')).toBe(
      'Sprites (a/b): by Kenney, x',
    );
  });
});

describe('parseCredits', () => {
  it('pulls out headings, paragraphs, bullets and table rows', () => {
    const md = [
      '# Credits',
      '',
      'Every pack we use.',
      '',
      '## Art',
      '',
      '- **Tiles**: by [Someone](https://example.com).',
      '* Walls',
      '',
      '## Sound',
      '',
      'Made by Kenney,',
      'licensed CC0.',
      '',
      '| File      | Pack                      |',
      '| --------- | :-----------------------: |',
      '| `a.ogg`   | [Interface](https://x.y)  |',
      '| `b.ogg`   | Impact                    |',
    ].join('\n');
    expect(parseCredits(md)).toEqual([
      { kind: 'text', text: 'Every pack we use.' },
      { kind: 'heading', text: 'Art' },
      { kind: 'item', text: 'Tiles: by Someone.' },
      { kind: 'item', text: 'Walls' },
      { kind: 'heading', text: 'Sound' },
      { kind: 'text', text: 'Made by Kenney, licensed CC0.' },
      { kind: 'row', text: 'a.ogg · Interface' },
      { kind: 'row', text: 'b.ogg · Impact' },
    ]);
  });

  it('reads the real CREDITS.md', () => {
    const lines = parseCredits(credits);
    expect(lines.filter((l) => l.kind === 'heading').map((l) => l.text)).toEqual([
      'Art',
      'Sound effects',
    ]);
    expect(lines.some((l) => l.kind === 'row' && l.text.startsWith('pick-up.ogg'))).toBe(true);
    expect(lines.every((l) => !/[[\]*`|]/.test(l.text))).toBe(true);
  });
});
