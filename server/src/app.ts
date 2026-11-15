import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import type { Part, SetupDoc } from '@viz/shared';
import { newId, Store } from './db';

export interface AppOptions {
  dataDir: string;
  /** Folder holding the built client. Omit while developing with the Vite dev server. */
  clientDir?: string;
  port?: number;
  logger?: boolean;
}

const FILE_TYPES: Record<string, string> = { glb: 'model/gltf-binary', png: 'image/png', jpg: 'image/jpeg' };
const SAFE_FILE = /^[A-Za-z0-9_-]+\.(glb|png|jpg)$/;

/** IPv4 addresses other computers on the network can use to reach this one. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const addr of list ?? []) if (addr.family === 'IPv4' && !addr.internal) out.push(addr.address);
  }
  return out;
}

function isDoc(value: unknown): value is SetupDoc {
  const d = value as SetupDoc;
  return !!d && typeof d.name === 'string' && Array.isArray(d.instances) && Array.isArray(d.cables);
}

function isPart(value: unknown): value is Part {
  const p = value as Part;
  return !!p && typeof p.name === 'string' && !!p.model && Array.isArray(p.pins) && Array.isArray(p.strips) && !!p.bbox;
}

export function buildApp(opts: AppOptions): { app: FastifyInstance; store: Store } {
  const filesDir = path.join(opts.dataDir, 'files');
  mkdirSync(filesDir, { recursive: true });
  const store = new Store(path.join(opts.dataDir, 'app.db'));

  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 32 * 1024 * 1024 });
  app.addHook('onClose', async () => store.close());

  // Model files and images arrive as raw bytes.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 1024 * 1024 * 1024 }, (_req, body, done) =>
    done(null, body),
  );

  const removeFile = (name: string | undefined): void => {
    if (!name || !SAFE_FILE.test(name)) return;
    const file = path.join(filesDir, name);
    if (existsSync(file)) unlinkSync(file);
  };
  const filesOf = (part: Part): string[] => {
    const names: string[] = [];
    if (part.model.kind === 'glb') names.push(part.model.file);
    if (part.thumb) names.push(part.thumb);
    return names;
  };

  app.get('/api/info', async () => ({
    name: '3D Setup Visualizer',
    port: opts.port ?? null,
    lanUrls: lanAddresses().map((ip) => `http://${ip}:${opts.port ?? 80}`),
  }));

  // Files

  app.post<{ Querystring: { ext?: string } }>('/api/files', async (req, reply) => {
    const ext = String(req.query.ext ?? '').toLowerCase();
    if (!FILE_TYPES[ext]) return reply.code(400).send({ error: 'Unsupported file type. Use glb, png or jpg.' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return reply.code(400).send({ error: 'The upload was empty.' });
    const name = `${newId()}.${ext}`;
    writeFileSync(path.join(filesDir, name), req.body);
    return { file: name };
  });

  app.register(fastifyStatic, {
    root: filesDir,
    prefix: '/files/',
    decorateReply: false,
    // File names are random and never reused, so browsers may keep them.
    immutable: true,
    maxAge: '365d',
  });

  // Parts

  app.get('/api/parts', async () => store.listParts());

  app.post('/api/parts', async (req, reply) => {
    if (!isPart(req.body)) return reply.code(400).send({ error: 'This is not a valid part.' });
    return store.savePart({ ...req.body, id: newId() });
  });

  app.put<{ Params: { id: string } }>('/api/parts/:id', async (req, reply) => {
    const existing = store.getPart(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'This part no longer exists.' });
    if (!isPart(req.body)) return reply.code(400).send({ error: 'This is not a valid part.' });
    const saved = store.savePart({ ...req.body, id: existing.id });
    // Drop files the part stopped using, e.g. after its model was replaced.
    const keep = new Set(filesOf(saved));
    for (const name of filesOf(existing)) if (!keep.has(name)) removeFile(name);
    return saved;
  });

  app.delete<{ Params: { id: string } }>('/api/parts/:id', async (req, reply) => {
    const existing = store.getPart(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'This part no longer exists.' });
    store.deletePart(existing.id);
    filesOf(existing).forEach(removeFile);
    return { ok: true };
  });

  // Setups

  app.get('/api/setups', async () => store.listSetups());

  app.post<{ Body: { name?: string; doc?: SetupDoc } }>('/api/setups', async (req, reply) => {
    const body = req.body ?? {};
    if (body.doc !== undefined && !isDoc(body.doc)) return reply.code(400).send({ error: 'This is not a valid setup.' });
    const doc: SetupDoc = body.doc ?? { name: (body.name ?? '').trim() || 'Untitled setup', instances: [], cables: [] };
    return store.createSetup(doc);
  });

  app.get<{ Params: { id: string } }>('/api/setups/:id', async (req, reply) => {
    const setup = store.getSetup(req.params.id);
    return setup ?? reply.code(404).send({ error: 'This setup no longer exists.' });
  });

  app.put<{ Params: { id: string }; Body: { doc?: SetupDoc; baseVersion?: number; force?: boolean; thumb?: string } }>(
    '/api/setups/:id',
    async (req, reply) => {
      const { doc, baseVersion, force, thumb } = req.body ?? {};
      if (!isDoc(doc) || typeof baseVersion !== 'number') return reply.code(400).send({ error: 'This is not a valid setup.' });
      const okThumb = typeof thumb === 'string' && thumb.startsWith('data:image/') && thumb.length < 400_000 ? thumb : undefined;
      const result = store.saveSetup(req.params.id, doc, baseVersion, force === true, okThumb);
      if (result.ok) return result.setup;
      if (result.reason === 'missing') return reply.code(404).send({ error: 'This setup no longer exists.' });
      return reply.code(409).send({ error: 'conflict', current: result.current });
    },
  );

  app.post<{ Params: { id: string } }>('/api/setups/:id/duplicate', async (req, reply) => {
    const setup = store.getSetup(req.params.id);
    if (!setup) return reply.code(404).send({ error: 'This setup no longer exists.' });
    return store.createSetup({ ...setup.doc, name: `${setup.name} (copy)` }, setup.thumb);
  });

  app.delete<{ Params: { id: string } }>('/api/setups/:id', async (req, reply) => {
    return store.deleteSetup(req.params.id) ? { ok: true } : reply.code(404).send({ error: 'This setup no longer exists.' });
  });

  app.get<{ Params: { token: string } }>('/api/share/:token', async (req, reply) => {
    const setup = store.getSetupByToken(req.params.token);
    return setup ?? reply.code(404).send({ error: 'This share link is not valid any more.' });
  });

  // The web app itself.

  if (opts.clientDir && existsSync(opts.clientDir)) {
    app.register(fastifyStatic, { root: opts.clientDir, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/files/')) {
        return reply.code(404).send({ error: 'Not found.' });
      }
      // Any other address is a page inside the app.
      return reply.sendFile('index.html');
    });
  }

  return { app, store };
}
