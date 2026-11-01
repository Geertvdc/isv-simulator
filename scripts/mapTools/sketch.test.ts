import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../../src/render/playerColors';
import { SKETCH_TILE, drawMap, futureFootnote, legendEntries, renderSketchSvg } from './sketch';

const MAP = ['#I##K#', '#1.>v#', '#2_~C#', '#34L=#', '#S#'].join('\n');

describe('drawMap', () => {
  it('sizes the drawing by the widest row, padding short rows with void', () => {
    const drawing = drawMap(MAP);
    expect(drawing.width).toBe(6 * SKETCH_TILE);
    expect(drawing.height).toBe(5 * SKETCH_TILE);
    expect(drawing.chars.has(' ')).toBe(true);
  });

  it('numbers the spawns in the player colors', () => {
    const { svg } = drawMap(MAP);
    for (const [i, color] of PLAYER_COLORS.entries()) {
      expect(svg).toContain(`fill="#${color.toString(16).padStart(6, '0')}"`);
      expect(svg).toContain(`>${i + 1}</text>`);
    }
  });

  it('points belt arrows along the belt', () => {
    const { svg } = drawMap('>v');
    expect(svg).toContain('rotate(0 ');
    expect(svg).toContain('rotate(90 ');
  });

  it('marks unknown chars', () => {
    expect(drawMap('Q').svg).toContain('#ff00ff');
  });
});

describe('legendEntries', () => {
  it('lists each kind once, in a fixed order, future chars included', () => {
    const names = legendEntries(new Set(['v', '>', '2', '1', '.', '_'])).map((e) => e.name);
    expect(names[0]).toBe('floor');
    expect(names.filter((n) => n === 'conveyor belt')).toHaveLength(1);
    expect(names.filter((n) => n === 'player spawn')).toHaveLength(1);
    expect(names.some((n) => n.startsWith('wet floor'))).toBe(true);
  });

  it('knows the Startup chars', () => {
    const names = legendEntries(new Set(['o', '%', 'r'])).map((e) => e.name);
    expect(names).toEqual([
      expect.stringMatching(/^leaky tap/),
      expect.stringMatching(/^spill zone/),
      expect.stringMatching(/^mop robot route/),
    ]);
  });
});

describe('renderSketchSvg', () => {
  it('puts maps side by side with escaped titles and a legend', () => {
    const svg = renderSketchSvg(
      [
        { title: 'Current <old>', text: MAP },
        { title: 'Draft', text: null },
      ],
      'Level & co',
    );
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('Current &lt;old&gt;');
    expect(svg).toContain('Level &amp; co');
    expect(svg).toContain('no map yet');
    expect(svg).toContain('keyboard');
    expect(svg).toContain('not in the game yet');
  });

  it('shows a note under a panel title', () => {
    const svg = renderSketchSvg([{ title: 'Draft', text: '#', note: 'does not parse' }]);
    expect(svg).toContain('does not parse');
    expect(svg).not.toContain('not in the game yet');
  });

  it('names the stand-ins of the future chars it shows', () => {
    const svg = renderSketchSvg([{ title: 'Draft', text: '#lH_#' }]);
    expect(svg).toContain('express lift cabin as floor');
    expect(svg).toContain('mail chute hatch as counter');
    expect(svg).toContain('wet floor as floor');
  });
});

describe('Scale-Up chars', () => {
  it('draw the express lift apart from the lift, and the chute hatch as a block', () => {
    expect(drawMap('l').svg).toContain('>E</text>');
    expect(drawMap('L').svg).toContain('>L</text>');
    expect(drawMap('H').svg).toContain('>H</text>');
    expect(drawMap('lH').svg).not.toContain('#ff00ff');
  });
});

describe('futureFootnote', () => {
  it('names the stand-in of each future char used', () => {
    expect(futureFootnote(['#', '=', 'd', '+'])).toBe(
      '* not in the game yet: tools read partition as wall, meeting door as floor, badge turnstile as floor',
    );
  });
});
