import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Part, Setup, SetupMeta } from '@viz/shared';
import { buildApp } from '../src/app';

let dir: string;
let app: FastifyInstance;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'viz-'));
  app = buildApp({ dataDir: dir }).app;
});
afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const json = (payload: unknown) => ({ payload: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });

async function upload(ext: string, bytes = Buffer.from('model-bytes')): Promise<string> {
  const res = await app.inject({ method: 'POST', url: `/api/files?ext=${ext}`, payload: bytes, headers: { 'content-type': 'application/octet-stream' } });
  expect(res.statusCode).toBe(200);
  return res.json().file;
}

const partBody = (file: string, thumb: string): Omit<Part, 'id'> => ({
  name: 'Custom card',
  category: 'Custom hardware',
  model: { kind: 'glb', file },
  thumb,
  logicVoltage: 3.3,
  bbox: { min: [-10, -10, 0], max: [10, 10, 5] },
  pins: [],
  strips: [],
});

describe('setups', () => {
  it('creates, loads, lists and deletes', async () => {
    const created = (await app.inject({ method: 'POST', url: '/api/setups', ...json({ name: 'Bench A' }) })).json() as Setup;
    expect(created).toMatchObject({ name: 'Bench A', version: 1, doc: { instances: [], cables: [] } });
    expect(created.shareToken.length).toBeGreaterThan(10);
    expect((await app.inject({ url: `/api/setups/${created.id}` })).json()).toMatchObject({ id: created.id });
    expect((await app.inject({ url: '/api/setups' })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: `/api/setups/${created.id}` })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/setups/${created.id}` })).statusCode).toBe(404);
  });

  it('refuses a save from someone who loaded an older version, unless forced', async () => {
    const s = (await app.inject({ method: 'POST', url: '/api/setups', ...json({}) })).json() as Setup;
    const save = (name: string, baseVersion: number, force = false) =>
      app.inject({ method: 'PUT', url: `/api/setups/${s.id}`, ...json({ doc: { ...s.doc, name }, baseVersion, force }) });

    const first = await save('Mine', 1);
    expect(first.statusCode).toBe(200);
    expect((first.json() as SetupMeta).version).toBe(2);

    // A second browser still holds version 1.
    const stale = await save('Theirs', 1);
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: 'conflict', current: { version: 2, name: 'Mine' } });
    expect(((await app.inject({ url: `/api/setups/${s.id}` })).json() as Setup).name).toBe('Mine');

    const forced = await save('Theirs', 1, true);
    expect(forced.statusCode).toBe(200);
    expect((forced.json() as SetupMeta).version).toBe(3);
    expect(((await app.inject({ url: `/api/setups/${s.id}` })).json() as Setup).name).toBe('Theirs');
  });

  it('opens a setup by its share token and duplicates it', async () => {
    const s = (await app.inject({ method: 'POST', url: '/api/setups', ...json({ name: 'Shared' }) })).json() as Setup;
    expect((await app.inject({ url: `/api/share/${s.shareToken}` })).json()).toMatchObject({ id: s.id, name: 'Shared' });
    expect((await app.inject({ url: '/api/share/wrong' })).statusCode).toBe(404);
    const copy = (await app.inject({ method: 'POST', url: `/api/setups/${s.id}/duplicate` })).json() as Setup;
    expect(copy.name).toBe('Shared (copy)');
    expect(copy.id).not.toBe(s.id);
    expect(copy.shareToken).not.toBe(s.shareToken);
  });

  it('rejects malformed bodies', async () => {
    const s = (await app.inject({ method: 'POST', url: '/api/setups', ...json({}) })).json() as Setup;
    expect((await app.inject({ method: 'PUT', url: `/api/setups/${s.id}`, ...json({ doc: { name: 'x' }, baseVersion: 1 }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/setups/nope', ...json({ doc: s.doc, baseVersion: 1 }) })).statusCode).toBe(404);
  });
});

describe('parts and files', () => {
  it('stores a model file, serves it, and removes it with the part', async () => {
    const file = await upload('glb');
    const thumb = await upload('png');
    expect(file).toMatch(/^[\w-]+\.glb$/);
    const served = await app.inject({ url: `/files/${file}` });
    expect(served.statusCode).toBe(200);
    expect(served.body).toBe('model-bytes');

    const part = (await app.inject({ method: 'POST', url: '/api/parts', ...json(partBody(file, thumb)) })).json() as Part;
    expect(part.id).toBeTruthy();
    expect(part.builtin).toBe(false);
    expect((await app.inject({ url: '/api/parts' })).json()).toHaveLength(1);

    const renamed = (await app.inject({ method: 'PUT', url: `/api/parts/${part.id}`, ...json({ ...part, name: 'Renamed' }) })).json() as Part;
    expect(renamed.name).toBe('Renamed');
    expect(existsSync(path.join(dir, 'files', file))).toBe(true);

    expect((await app.inject({ method: 'DELETE', url: `/api/parts/${part.id}` })).statusCode).toBe(200);
    expect(existsSync(path.join(dir, 'files', file))).toBe(false);
    expect(existsSync(path.join(dir, 'files', thumb))).toBe(false);
    expect((await app.inject({ url: '/api/parts' })).json()).toHaveLength(0);
  });

  it('deletes the old model file when a part gets a new one', async () => {
    const oldFile = await upload('glb');
    const thumb = await upload('png');
    const part = (await app.inject({ method: 'POST', url: '/api/parts', ...json(partBody(oldFile, thumb)) })).json() as Part;
    const newFile = await upload('glb', Buffer.from('new'));
    await app.inject({ method: 'PUT', url: `/api/parts/${part.id}`, ...json({ ...part, model: { kind: 'glb', file: newFile } }) });
    expect(existsSync(path.join(dir, 'files', oldFile))).toBe(false);
    expect(existsSync(path.join(dir, 'files', newFile))).toBe(true);
  });

  it('refuses unknown file types and path tricks', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/files?ext=exe', payload: Buffer.from('x'), headers: { 'content-type': 'application/octet-stream' } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ url: '/files/..%2Fapp.db' })).statusCode).toBeGreaterThanOrEqual(400);
    expect((await app.inject({ method: 'POST', url: '/api/parts', ...json({ name: 'x' }) })).statusCode).toBe(400);
  });
});

describe('serving the web app', () => {
  it('serves files added after start, sends pages to index.html, and answers 404 for missing files', async () => {
    const clientDir = path.join(dir, 'client');
    mkdirSync(path.join(clientDir, 'assets'), { recursive: true });
    writeFileSync(path.join(clientDir, 'index.html'), '<title>app</title>');
    const web = buildApp({ dataDir: path.join(dir, 'web-data'), clientDir }).app;
    try {
      await web.ready();
      // A rebuild writes new asset names while the server keeps running.
      writeFileSync(path.join(clientDir, 'assets', 'index-new.js'), 'console.log(1)');
      const asset = await web.inject({ url: '/assets/index-new.js' });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers['content-type']).toContain('javascript');
      for (const url of ['/', '/setups/abc', '/s/token', '/parts/builtin%3Aarduino-uno']) {
        const res = await web.inject({ url });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain('<title>app</title>');
      }
      expect((await web.inject({ url: '/assets/index-old.js' })).statusCode).toBe(404);
      expect((await web.inject({ url: '/api/nope' })).statusCode).toBe(404);
      expect((await web.inject({ url: '/files/nope.glb' })).statusCode).toBe(404);
    } finally {
      await web.close();
    }
  });
});
