import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, zip } from './zip';

describe('crc32', () => {
  it('matches the reference value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('zip', () => {
  it('writes an archive that unzip can extract', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-test-'));
    const archive = join(dir, 'test.zip');
    const text = new TextEncoder();
    writeFileSync(
      archive,
      zip([
        { name: 'a.txt', data: text.encode('hello') },
        { name: 'sub/b.txt', data: text.encode('world') },
      ]),
    );
    execFileSync('unzip', ['-q', archive, '-d', dir]);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('hello');
    expect(readFileSync(join(dir, 'sub/b.txt'), 'utf8')).toBe('world');
  });
});
