/** The HTTP guard: its pure parts, then body size, rate limits and CORS over real HTTP. */

import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/net/protocol';
import { type RunningServer, type GameServerOptions, startGameServer } from './app';
import {
  classifyRequest,
  clientIp,
  corsOrigin,
  normalizedPath,
  parseAllowedOrigins,
  parseTrustProxy,
} from './httpGuard';
import { MemoryProfileStore } from './profileStore';

describe('parseAllowedOrigins', () => {
  it('allows any origin when unset, empty or *', () => {
    for (const raw of [undefined, '', ' , ', '*', 'https://a.example,*']) {
      expect(parseAllowedOrigins(raw)).toBeNull();
    }
  });

  it('splits, trims and drops trailing slashes', () => {
    expect(parseAllowedOrigins(' https://a.example/ ,http://localhost:5173,')).toEqual([
      'https://a.example',
      'http://localhost:5173',
    ]);
  });
});

describe('parseTrustProxy', () => {
  it('trusts no proxy unless told', () => {
    for (const raw of [undefined, '', '0', 'false', 'no', '-1', '1.5']) {
      expect(parseTrustProxy(raw)).toBe(0);
    }
    expect(parseTrustProxy('true')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });
});

describe('corsOrigin', () => {
  it('echoes any origin when there is no list', () => {
    expect(corsOrigin('http://evil.example', null)).toBe('http://evil.example');
    expect(corsOrigin(null, null)).toBe('*');
  });

  it('echoes only allowed origins, naming an allowed one otherwise', () => {
    const allowed = ['https://game.example', 'http://localhost:5173'];
    expect(corsOrigin('http://localhost:5173', allowed)).toBe('http://localhost:5173');
    expect(corsOrigin('http://evil.example', allowed)).toBe('https://game.example');
    expect(corsOrigin(null, allowed)).toBe('https://game.example');
  });
});

describe('clientIp', () => {
  it('uses the peer address and ignores X-Forwarded-For unless a proxy is trusted', () => {
    expect(clientIp('10.0.0.1', '1.2.3.4', 0)).toBe('10.0.0.1');
    expect(clientIp(undefined, undefined, 0)).toBe('unknown');
  });

  it('takes the address our proxy added, not one the client made up', () => {
    expect(clientIp('10.0.0.1', 'fake, 1.2.3.4', 1)).toBe('1.2.3.4');
    expect(clientIp('10.0.0.1', ['fake, 1.2.3.4', '5.6.7.8'], 2)).toBe('1.2.3.4');
    expect(clientIp('10.0.0.1', '1.2.3.4', 3)).toBe('1.2.3.4');
    expect(clientIp('10.0.0.1', undefined, 1)).toBe('10.0.0.1');
    expect(clientIp('10.0.0.1', ' , ', 1)).toBe('10.0.0.1');
  });
});

describe('classifyRequest', () => {
  it('sorts requests by the limit they fall under', () => {
    expect(classifyRequest('POST', '/matchmake/create/game')).toBe('createRoom');
    expect(classifyRequest('POST', '/matchmake/joinOrCreate/game')).toBe('createRoom');
    expect(classifyRequest('POST', '/matchmake/joinById/ABCD')).toBe('joinRoom');
    expect(classifyRequest('POST', '/matchmake/join/game')).toBe('joinRoom');
    expect(classifyRequest('POST', '/matchmake/reconnect/ABCD')).toBe('other');
    expect(classifyRequest('GET', '/rooms/ABCD?x=1')).toBe('lookupRoom');
    expect(classifyRequest('PUT', '/profiles/some-id')).toBe('profileWrite');
    expect(classifyRequest('GET', '/profiles/some-id')).toBe('other');
    expect(classifyRequest('OPTIONS', '/matchmake/create/game')).toBe('other');
  });

  it('classifies by the path the router sees, not the raw one', () => {
    expect(classifyRequest('POST', '/./matchmake/create/game')).toBe('createRoom');
    expect(classifyRequest('POST', '/x/../matchmake/joinOrCreate/game')).toBe('createRoom');
    expect(classifyRequest('POST', '/%2e/matchmake/joinById/ABCD')).toBe('joinRoom');
    expect(classifyRequest('POST', '/MATCHMAKE/CREATE/game')).toBe('createRoom');
    expect(classifyRequest('GET', '/x/%2E%2E/rooms/ABCD')).toBe('lookupRoom');
    expect(classifyRequest('PUT', '\\profiles\\some-id')).toBe('profileWrite');
  });
});

describe('normalizedPath', () => {
  it('passes plain paths', () => {
    expect(normalizedPath('/matchmake/create/game')).toBe('/matchmake/create/game');
    expect(normalizedPath('/rooms/ABCD?x=%20')).toBe('/rooms/ABCD');
    expect(normalizedPath('/')).toBe('/');
    // The router decodes no escapes besides dot segments, so these match as written.
    expect(normalizedPath('/rooms/%20ab%2Fcd')).toBe('/rooms/%20ab%2Fcd');
  });

  it('refuses paths the router would read differently', () => {
    for (const url of [
      '/./matchmake/create/game',
      '/x/../matchmake/create/game',
      '/%2e/matchmake/create/game',
      '/%2E%2E/rooms/ABCD',
      '//matchmake/create/game',
      '/rooms/ABCD/.',
      '\\rooms\\ABCD',
      '/rooms/AB CD',
      '/rooms/ABCD#x',
      'http://evil.example/matchmake/create/game',
      '*',
      '',
    ]) {
      expect(normalizedPath(url), url).toBeNull();
    }
  });
});

describe('the guard over HTTP', () => {
  const ID = '6c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
  const hello = {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    userId: ID,
    displayName: 'Ada',
    localPlayers: 1,
  };
  let server: RunningServer | null = null;
  let base = '';

  async function start(options: GameServerOptions): Promise<void> {
    server = await startGameServer(0, { store: new MemoryProfileStore(), ...options });
    base = `http://localhost:${server.port}`;
  }

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const putProfile = (body: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/profiles/${ID}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });

  it('refuses a body over the limit with a 413, before reading it', async () => {
    await start({});
    const big = await putProfile(JSON.stringify({ displayName: 'x'.repeat(500_000) }));
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: 'request body too large' });
    // A huge one may just have its connection cut.
    const huge = await putProfile('x'.repeat(5_000_000)).catch(() => null);
    expect(huge === null || huge.status === 413).toBe(true);
    expect((await putProfile('{}')).status).toBe(200);
  });

  it('rate-limits profile writes per IP', async () => {
    await start({ limits: { profileWrite: { burst: 2, refillMs: 60_000 } } });
    expect((await putProfile('{}')).status).toBe(200);
    expect((await putProfile('{}')).status).toBe(200);
    const refused = await putProfile('{}');
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('60');
    // Reading is not limited.
    expect((await fetch(`${base}/profiles/${ID}`)).status).toBe(200);
  });

  it('rate-limits room creation per IP', async () => {
    await start({ limits: { roomCreate: { burst: 2, refillMs: 60_000 } } });
    expect((await post('/matchmake/create/game', hello)).status).toBe(200);
    expect((await post('/matchmake/create/game', hello)).status).toBe(200);
    const refused = await post('/matchmake/create/game', hello);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: 'too many rooms created' });
  });

  it('limits failed joins and lookups per IP, so codes cannot be guessed', async () => {
    await start({ limits: { failedJoin: { burst: 3, refillMs: 60_000 } } });
    const created = (await (await post('/matchmake/create/game', hello)).json()) as {
      roomId: string;
    };
    // Successful lookups cost nothing.
    for (let i = 0; i < 5; i++) {
      expect((await fetch(`${base}/rooms/${created.roomId}`)).status).toBe(200);
    }
    expect((await fetch(`${base}/rooms/ZZZZ`)).status).toBe(404);
    expect((await post('/matchmake/joinById/ZZZZ', hello)).status).toBeGreaterThanOrEqual(400);
    expect((await post('/matchmake/joinById/YYYY', hello)).status).toBeGreaterThanOrEqual(400);
    // Out of attempts: even the right code is refused for now.
    const refused = await post(`/matchmake/joinById/${created.roomId}`, hello);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: 'too many failed joins' });
    expect((await fetch(`${base}/rooms/${created.roomId}`)).status).toBe(429);
  });

  /** A raw request, so the path goes out exactly as written (`fetch` would normalize it). */
  const raw = (method: string, path: string, body?: unknown) =>
    new Promise<number>((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const req = request(
        `${base}/`,
        {
          method,
          path,
          headers:
            data === undefined
              ? {}
              : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end(data);
    });

  it('refuses paths that would dodge the limits by normalizing differently', async () => {
    await start({ limits: { roomCreate: { burst: 1, refillMs: 60_000 } } });
    expect(await raw('POST', '/matchmake/create/game', hello)).toBe(200);
    expect(await raw('POST', '/matchmake/create/game', hello)).toBe(429);
    for (const path of [
      '/./matchmake/create/game',
      '/x/../matchmake/create/game',
      '/%2e/matchmake/create/game',
      '/x/%2E%2E/matchmake/joinOrCreate/game',
      '//matchmake/create/game',
    ]) {
      expect(await raw('POST', path, hello), path).toBe(400);
    }
    for (const path of ['/./rooms/QQQQ', '/x/../rooms/QQQQ', '/%2e/rooms/QQQQ']) {
      expect(await raw('GET', path), path).toBe(400);
    }
    expect(await raw('PUT', `/./profiles/${ID}`, {})).toBe(400);
  });

  it('keys the limits on X-Forwarded-For only when a proxy is trusted', async () => {
    const limits = { profileWrite: { burst: 1, refillMs: 60_000 } };
    await start({ limits });
    expect((await putProfile('{}', { 'x-forwarded-for': '1.1.1.1' })).status).toBe(200);
    expect((await putProfile('{}', { 'x-forwarded-for': '2.2.2.2' })).status).toBe(429);
    await server?.close();
    await start({ limits, trustProxyHops: 1 });
    expect((await putProfile('{}', { 'x-forwarded-for': '1.1.1.1' })).status).toBe(200);
    expect((await putProfile('{}', { 'x-forwarded-for': '2.2.2.2' })).status).toBe(200);
    expect((await putProfile('{}', { 'x-forwarded-for': '2.2.2.2' })).status).toBe(429);
  });

  it('answers CORS for allowed origins only', async () => {
    await start({ allowedOrigins: ['http://game.example'] });
    const preflight = (origin: string) =>
      fetch(`${base}/profiles/${ID}`, {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'PUT' },
      });
    const allowed = await preflight('http://game.example');
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://game.example');
    const evil = await preflight('http://evil.example');
    expect(evil.headers.get('access-control-allow-origin')).toBe('http://game.example');
    const matchmake = await fetch(`${base}/matchmake/create/game`, {
      method: 'OPTIONS',
      headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(matchmake.headers.get('access-control-allow-origin')).toBe('http://game.example');
  });

  it('answers CORS for any origin without a list (the dev default)', async () => {
    await start({});
    const res = await fetch(`${base}/health`, { headers: { origin: 'http://localhost:5173' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
});
