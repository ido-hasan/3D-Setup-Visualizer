import { Copy, Layers, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Part, SetupMeta } from '@viz/shared';
import { api, loadAllParts } from '../api';
import { timeAgo } from '../lib/util';
import { Confirm, Loading, PartThumb, pinCount } from '../ui';

export function Brand() {
  return (
    <Link to="/" className="brand">
      <img src="/favicon.svg" alt="" />
      3D Setup Visualizer
    </Link>
  );
}

type Pending = { kind: 'setup'; item: SetupMeta } | { kind: 'part'; item: Part } | null;

export function Home() {
  const navigate = useNavigate();
  const [setups, setSetups] = useState<SetupMeta[] | null>(null);
  const [parts, setParts] = useState<Part[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [pendingDelete, setPendingDelete] = useState<Pending>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api.listSetups(), loadAllParts()]);
      setSetups(s);
      setParts(p);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    document.title = '3D Setup Visualizer';
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const newSetup = () =>
    run(async () => {
      const setup = await api.createSetup('Untitled setup');
      navigate(`/setups/${setup.id}`);
    });

  const categories = useMemo(() => ['All', ...new Set((parts ?? []).map((p) => p.category))], [parts]);
  const shownParts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (parts ?? []).filter((p) => (category === 'All' || p.category === category) && (!q || p.name.toLowerCase().includes(q)));
  }, [parts, query, category]);

  if (!setups || !parts) {
    return (
      <div className="page">
        <header className="topbar">
          <Brand />
        </header>
        {error ? (
          <div className="center-msg solid">
            <p className="error-text">{error}</p>
            <button className="btn" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : (
          <Loading />
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <Brand />
        <div className="spacer" />
        <button className="btn" onClick={() => navigate('/parts/new')}>
          <Upload /> Upload 3D model
        </button>
        <button className="btn primary" onClick={newSetup} disabled={busy}>
          <Plus /> New setup
        </button>
      </header>
      <main className="home">
        <div className="home-inner">
          {error && (
            <div className="banner" role="alert">
              {error}
              <div className="spacer" />
              <button className="btn small" onClick={() => setError('')}>
                Dismiss
              </button>
            </div>
          )}

          <section>
            <div className="section-head">
              <h1>Setups</h1>
              <p>{setups.length === 0 ? 'A setup is a bench with boards and the cables between them.' : `${setups.length} saved`}</p>
            </div>
            <div className="grid">
              <button className="card new" onClick={newSetup} disabled={busy}>
                <Plus />
                New setup
              </button>
              {setups.map((s) => (
                <div
                  key={s.id}
                  className="card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/setups/${s.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/setups/${s.id}`)}
                >
                  <div className="thumb cover">{s.thumb ? <img src={s.thumb} alt="" /> : <Layers size={34} />}</div>
                  <div className="body">
                    <div className="title">{s.name}</div>
                    <div className="meta">Edited {timeAgo(s.updatedAt)}</div>
                  </div>
                  <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn icon small"
                      title="Duplicate"
                      aria-label={`Duplicate ${s.name}`}
                      onClick={() => run(async () => void (await api.duplicateSetup(s.id), await refresh()))}
                    >
                      <Copy />
                    </button>
                    <button className="btn icon small danger" title="Delete" aria-label={`Delete ${s.name}`} onClick={() => setPendingDelete({ kind: 'setup', item: s })}>
                      <Trash2 />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="section-head">
              <h1>Parts library</h1>
              <p>{parts.length} parts</p>
              <div className="spacer" />
              <div style={{ position: 'relative', width: 220 }}>
                <Search size={15} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--muted)' }} />
                <input className="input" style={{ paddingLeft: 30 }} placeholder="Search parts" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search parts" />
              </div>
            </div>
            <div className="tabs" style={{ marginBottom: 14 }}>
              {categories.map((c) => (
                <button key={c} className={`btn small${c === category ? ' active' : ''}`} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
            <div className="grid">
              <button className="card new" onClick={() => navigate('/parts/new')}>
                <Upload />
                Upload 3D model
                <span className="hint" style={{ fontWeight: 400 }}>
                  STEP, STL, OBJ or GLB
                </span>
              </button>
              {shownParts.map((p) => (
                <div
                  key={p.id}
                  className="card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/parts/${encodeURIComponent(p.id)}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/parts/${encodeURIComponent(p.id)}`)}
                >
                  <div className="thumb">
                    <PartThumb part={p} />
                  </div>
                  <div className="body">
                    <div className="title" title={p.name}>
                      {p.name}
                    </div>
                    <div className="meta">
                      {p.category} · {pinCount(p)} pins
                    </div>
                  </div>
                  {p.builtin ? (
                    <span className="badge" style={{ position: 'absolute', top: 8, left: 8 }}>
                      Built-in
                    </span>
                  ) : (
                    <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn icon small danger" title="Delete" aria-label={`Delete ${p.name}`} onClick={() => setPendingDelete({ kind: 'part', item: p })}>
                        <Trash2 />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {shownParts.length === 0 && <div className="empty" style={{ marginTop: 14 }}>No parts match.</div>}
          </section>
        </div>
      </main>

      {pendingDelete?.kind === 'setup' && (
        <Confirm
          title="Delete this setup?"
          message={`"${pendingDelete.item.name}" will be removed for everyone. This cannot be undone.`}
          confirmLabel="Delete setup"
          danger
          onClose={() => setPendingDelete(null)}
          onConfirm={() => run(async () => void (await api.deleteSetup(pendingDelete.item.id), await refresh()))}
        />
      )}
      {pendingDelete?.kind === 'part' && (
        <Confirm
          title="Delete this part?"
          message={`"${pendingDelete.item.name}" and its 3D model will be removed. Setups that use it will show it as missing, and its cables will be flagged.`}
          confirmLabel="Delete part"
          danger
          onClose={() => setPendingDelete(null)}
          onConfirm={() => run(async () => void (await api.deletePart(pendingDelete.item.id), await refresh()))}
        />
      )}
    </div>
  );
}
