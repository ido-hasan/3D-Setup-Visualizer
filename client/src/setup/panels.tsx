import { AlertTriangle, CheckCircle2, Copy, Plus, RotateCcw, RotateCw, Search, Trash2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CABLE_SWATCHES, cableDescription, cableGeometry, cableLength, type Part } from '@viz/shared';
import { PIN_TYPE_LABELS } from '../lib/pinColors';
import { fmt } from '../lib/util';
import { NumberInput, PartThumb, TextInput } from '../ui';
import {
  deleteSelection,
  duplicateSelection,
  GRID,
  rotateInstance,
  select,
  updateCable,
  updateInstance,
  useAnalysis,
  useEditor,
} from './store';

export const PART_DRAG_TYPE = 'application/x-setup-part';

/** The library: click a part to put it on the bench, or drag it there. */
export function PartsPanel({ onAdd }: { onAdd: (partId: string) => void }) {
  const parts = useEditor((s) => s.parts);
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Part[]>();
    for (const part of Object.values(parts)) {
      if (q && !part.name.toLowerCase().includes(q)) continue;
      const key = part.builtin ? part.category : 'Uploaded';
      map.set(key, [...(map.get(key) ?? []), part]);
    }
    const order = ['Uploaded', 'Breadboard', 'Microcontroller', 'Single-board computer', 'USB adapter', 'RF'];
    return [...map.entries()].sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - ((order.indexOf(b[0]) + 99) % 99));
  }, [parts, query]);

  return (
    <aside className="side">
      <div className="side-section">
        <div className="side-head">
          <h3>Parts</h3>
          <div className="spacer" />
          <Link className="btn small" to="/parts/new">
            <Plus /> Upload
          </Link>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Search parts" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search parts" />
        </div>
      </div>
      <div className="side-section grow">
        <div className="part-list">
          {groups.map(([group, list]) => (
            <div key={group}>
              <div className="group-title">{group}</div>
              {list.map((part) => (
                <button
                  key={part.id}
                  className="part-item"
                  draggable
                  title={`Add ${part.name}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(PART_DRAG_TYPE, part.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onAdd(part.id)}
                >
                  <PartThumb part={part} />
                  <span className="name">{part.name}</span>
                  <Plus size={16} className="add" />
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && <p className="hint">No parts match.</p>}
        </div>
      </div>
    </aside>
  );
}

function InstanceInspector({ id }: { id: string }) {
  const inst = useEditor((s) => s.doc.instances.find((i) => i.id === id));
  const part = useEditor((s) => (inst ? s.parts[inst.partId] : undefined));
  const cables = useEditor((s) => s.doc.cables);
  const readOnly = useEditor((s) => s.readOnly);
  const analysis = useAnalysis();
  if (!inst) return null;
  const attached = cables.filter((c) => c.from.instanceId === id || c.to.instanceId === id);
  const seated = analysis.netlist.snaps.filter((s) => s.pin.instanceId === id);
  const host = seated.length ? analysis.index.instances.get(seated[0].hole.instanceId) : undefined;

  return (
    <>
      <div className="side-section">
        <h3>Board</h3>
        <div className="field">
          <label htmlFor="inst-name">Name</label>
          <TextInput id="inst-name" value={inst.name} disabled={readOnly} onCommit={(v) => updateInstance(id, { name: v.trim() || inst.name })} />
        </div>
        <dl className="kv">
          <dt>Part</dt>
          <dd>{part ? <Link to={`/parts/${encodeURIComponent(part.id)}`}>{part.name}</Link> : <span className="error-text">Missing part</span>}</dd>
          {part && (
            <>
              <dt>Logic</dt>
              <dd>{part.isBreadboard ? 'none (passive)' : `${part.logicVoltage} V`}</dd>
            </>
          )}
          {host && (
            <>
              <dt>Plugged into</dt>
              <dd>
                {host.name} ({seated.length} pins)
              </dd>
            </>
          )}
        </dl>
        {!readOnly && (
          <>
            <div className="field-row">
              <div className="field">
                <label htmlFor="inst-x">X (mm)</label>
                <NumberInput id="inst-x" value={inst.x} step={GRID} onCommit={(x) => updateInstance(id, { x })} />
              </div>
              <div className="field">
                <label htmlFor="inst-y">Y (mm)</label>
                <NumberInput id="inst-y" value={inst.y} step={GRID} onCommit={(y) => updateInstance(id, { y })} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <span className="label">Rotation: {inst.rotZ}°</span>
                <div className="btn-group">
                  <button className="btn" onClick={() => rotateInstance(id, 90)} title="Rotate left (R)" aria-label="Rotate left">
                    <RotateCcw />
                  </button>
                  <button className="btn" onClick={() => rotateInstance(id, -90)} title="Rotate right (Shift+R)" aria-label="Rotate right">
                    <RotateCw />
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="inst-z">Height (mm)</label>
                <NumberInput id="inst-z" value={inst.z} step={1} min={0} onCommit={(z) => updateInstance(id, { z })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={duplicateSelection}>
                <Copy /> Duplicate
              </button>
              <button className="btn danger" onClick={deleteSelection}>
                <Trash2 /> Delete
              </button>
            </div>
          </>
        )}
      </div>
      <div className="side-section">
        <h3>Cables on this board ({attached.length})</h3>
        {attached.length === 0 && <p className="hint">None yet.</p>}
        {attached.map((c) => {
          const mine = c.from.instanceId === id ? c.from : c.to;
          const other = c.from.instanceId === id ? c.to : c.from;
          return (
            <button key={c.id} className="part-item" style={{ cursor: 'pointer' }} onClick={() => select({ kind: 'cable', id: c.id })}>
              <span className="dot" style={{ background: c.color }} />
              <span className="name">
                {analysis.index.resolve(mine)?.pin.name ?? '(missing pin)'} → {analysis.index.describe(other)}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function CableInspector({ id }: { id: string }) {
  const cable = useEditor((s) => s.doc.cables.find((c) => c.id === id));
  const readOnly = useEditor((s) => s.readOnly);
  const analysis = useAnalysis();
  if (!cable) return null;
  const a = analysis.index.resolve(cable.from);
  const b = analysis.index.resolve(cable.to);
  const end = (r: typeof a, ref: typeof cable.from) =>
    r ? (
      <>
        {r.instance.name} · <strong>{r.pin.name}</strong> <span className="hint">({PIN_TYPE_LABELS[r.pin.type]})</span>
      </>
    ) : (
      <span className="error-text">{analysis.index.describe(ref)}</span>
    );
  return (
    <div className="side-section">
      <h3>Cable</h3>
      <dl className="kv">
        <dt>From</dt>
        <dd>{end(a, cable.from)}</dd>
        <dt>To</dt>
        <dd>{end(b, cable.to)}</dd>
        {a && b && (
          <>
            <dt>Type</dt>
            <dd>{cableDescription(a.pin, b.pin)}</dd>
            <dt>Length</dt>
            <dd>about {fmt(cableLength(a, b, cable.controlPoints, cableGeometry(a.pin, b.pin)) / 10, 0)} cm</dd>
          </>
        )}
      </dl>
      {(!a || !b) && <p className="error-text">A pin this cable used was removed from the part. Delete the cable, or draw it again.</p>}
      <div className="field">
        <label htmlFor="cable-label">Label</label>
        <TextInput id="cable-label" value={cable.label} disabled={readOnly} placeholder="e.g. I2C clock" onCommit={(label) => updateCable(id, { label })} />
      </div>
      {!readOnly && (
        <>
          <div className="field">
            <span className="label">Colour</span>
            <div className="swatches">
              {CABLE_SWATCHES.map((c) => (
                <button
                  key={c}
                  className={`swatch${cable.color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  aria-label={`Colour ${c}`}
                  onClick={() => updateCable(id, { color: c, autoColor: false })}
                />
              ))}
              <label className={`swatch custom${CABLE_SWATCHES.includes(cable.color) ? '' : ' on'}`} title="Other colour">
                <input type="color" value={cable.color} aria-label="Other colour" onChange={(e) => updateCable(id, { color: e.target.value, autoColor: false })} />
              </label>
            </div>
          </div>
          <p className="hint">Drag the white dot on the cable to route it. Double-click a blue dot to remove it.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={cable.controlPoints.length === 0} onClick={() => updateCable(id, { controlPoints: [] })}>
              Reset route
            </button>
            <button className="btn danger" onClick={deleteSelection}>
              <Trash2 /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function IssuesPanel() {
  const analysis = useAnalysis();
  const highlight = useEditor((s) => s.highlightIssue);
  const cableCount = useEditor((s) => s.doc.cables.length);
  const { issues } = analysis;
  return (
    <div className="side-section grow">
      <div className="side-head">
        <h3>Checks</h3>
        {issues.length > 0 && <span className={`badge ${issues.some((i) => i.severity === 'error') ? 'error' : 'warn'}`}>{issues.length}</span>}
      </div>
      {issues.length === 0 &&
        (cableCount > 0 ? (
          <p className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--ok)' }}>
            <CheckCircle2 size={16} /> No wiring problems found.
          </p>
        ) : (
          <p className="hint">Wiring is checked as you draw cables: shorts, 5 V on 3.3 V pins, and missing ground or power.</p>
        ))}
      {issues.map((issue) => (
        <button
          key={issue.id}
          className={`issue ${issue.severity}${highlight === issue.id ? ' active' : ''}`}
          onClick={() => {
            const on = highlight !== issue.id;
            useEditor.setState({ highlightIssue: on ? issue.id : null });
            if (!on) return;
            if (issue.cableIds.length === 1) select({ kind: 'cable', id: issue.cableIds[0] });
            else if (issue.cableIds.length === 0 && issue.instanceIds[0]) select({ kind: 'instance', id: issue.instanceIds[0] });
            else select(null);
          }}
        >
          {issue.severity === 'error' ? <XCircle /> : <AlertTriangle />}
          <span>
            <span className="t">{issue.title}</span>
            <br />
            <span className="m">{issue.message}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const counts = useEditor((s) => `${s.doc.instances.length} board${s.doc.instances.length === 1 ? '' : 's'}, ${s.doc.cables.length} cable${s.doc.cables.length === 1 ? '' : 's'}`);
  const readOnly = useEditor((s) => s.readOnly);
  return (
    <aside className="side right">
      {selection?.kind === 'instance' && <InstanceInspector id={selection.id} />}
      {selection?.kind === 'cable' && <CableInspector id={selection.id} />}
      {!selection && (
        <div className="side-section">
          <h3>Setup</h3>
          <p>{counts}</p>
          <p className="hint">{readOnly ? 'Click a board or a cable to see its details.' : 'Click a board or a cable to edit it.'}</p>
        </div>
      )}
      <IssuesPanel />
    </aside>
  );
}
