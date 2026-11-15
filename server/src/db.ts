import Database from 'better-sqlite3';
import type { Part, Setup, SetupDoc, SetupMeta } from '@viz/shared';
import { randomBytes } from 'node:crypto';

export const newId = (bytes = 9): string => randomBytes(bytes).toString('base64url');

interface SetupRow {
  id: string;
  name: string;
  json: string;
  version: number;
  share_token: string;
  thumb: string | null;
  created_at: string;
  updated_at: string;
}

const meta = (r: Omit<SetupRow, 'json'>): SetupMeta => ({
  id: r.id,
  name: r.name,
  version: r.version,
  shareToken: r.share_token,
  updatedAt: r.updated_at,
  createdAt: r.created_at,
  ...(r.thumb ? { thumb: r.thumb } : {}),
});

const full = (r: SetupRow): Setup => ({ ...meta(r), doc: JSON.parse(r.json) as SetupDoc });

export type SaveResult = { ok: true; setup: SetupMeta } | { ok: false; reason: 'missing' } | { ok: false; reason: 'conflict'; current: SetupMeta };

/** Everything the app stores, apart from model files: parts and setups as JSON rows in one SQLite file. */
export class Store {
  private db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS parts (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS setups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        json TEXT NOT NULL,
        version INTEGER NOT NULL,
        share_token TEXT NOT NULL UNIQUE,
        thumb TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  // Parts

  listParts(): Part[] {
    const rows = this.db.prepare('SELECT json FROM parts ORDER BY updated_at DESC').all() as Array<{ json: string }>;
    return rows.map((r) => JSON.parse(r.json) as Part);
  }

  getPart(id: string): Part | undefined {
    const row = this.db.prepare('SELECT json FROM parts WHERE id = ?').get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Part) : undefined;
  }

  savePart(part: Part): Part {
    const saved: Part = { ...part, builtin: false, updatedAt: new Date().toISOString() };
    this.db
      .prepare(
        `INSERT INTO parts (id, json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(saved.id, JSON.stringify(saved), saved.updatedAt);
    return saved;
  }

  deletePart(id: string): boolean {
    return this.db.prepare('DELETE FROM parts WHERE id = ?').run(id).changes > 0;
  }

  // Setups

  listSetups(): SetupMeta[] {
    const rows = this.db
      .prepare('SELECT id, name, version, share_token, thumb, created_at, updated_at FROM setups ORDER BY updated_at DESC')
      .all() as Array<Omit<SetupRow, 'json'>>;
    return rows.map(meta);
  }

  getSetup(id: string): Setup | undefined {
    const row = this.db.prepare('SELECT * FROM setups WHERE id = ?').get(id) as SetupRow | undefined;
    return row ? full(row) : undefined;
  }

  getSetupByToken(token: string): Setup | undefined {
    const row = this.db.prepare('SELECT * FROM setups WHERE share_token = ?').get(token) as SetupRow | undefined;
    return row ? full(row) : undefined;
  }

  createSetup(doc: SetupDoc, thumb?: string): Setup {
    const now = new Date().toISOString();
    const row: SetupRow = {
      id: newId(),
      name: doc.name,
      json: JSON.stringify(doc),
      version: 1,
      share_token: newId(12),
      thumb: thumb ?? null,
      created_at: now,
      updated_at: now,
    };
    this.db
      .prepare(
        `INSERT INTO setups (id, name, json, version, share_token, thumb, created_at, updated_at)
         VALUES (@id, @name, @json, @version, @share_token, @thumb, @created_at, @updated_at)`,
      )
      .run(row);
    return full(row);
  }

  /**
   * Save a setup. The save is refused when someone else saved after the caller loaded it
   * (baseVersion is behind), unless force is set.
   */
  saveSetup(id: string, doc: SetupDoc, baseVersion: number, force: boolean, thumb?: string): SaveResult {
    const tx = this.db.transaction((): SaveResult => {
      const row = this.db.prepare('SELECT id, name, version, share_token, thumb, created_at, updated_at FROM setups WHERE id = ?').get(id) as
        | Omit<SetupRow, 'json'>
        | undefined;
      if (!row) return { ok: false, reason: 'missing' };
      if (!force && row.version !== baseVersion) return { ok: false, reason: 'conflict', current: meta(row) };
      const next = {
        ...row,
        name: doc.name,
        version: row.version + 1,
        thumb: thumb ?? row.thumb,
        updated_at: new Date().toISOString(),
      };
      this.db
        .prepare('UPDATE setups SET name = ?, json = ?, version = ?, thumb = ?, updated_at = ? WHERE id = ?')
        .run(next.name, JSON.stringify(doc), next.version, next.thumb, next.updated_at, id);
      return { ok: true, setup: meta(next) };
    });
    return tx();
  }

  deleteSetup(id: string): boolean {
    return this.db.prepare('DELETE FROM setups WHERE id = ?').run(id).changes > 0;
  }
}
