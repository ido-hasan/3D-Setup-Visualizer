import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleDot,
  CloudOff,
  Copy,
  Download,
  FileUp,
  GripHorizontal,
  Loader2,
  MousePointer2,
  Redo2,
  RefreshCw,
  Tag,
  Trash2,
  Undo2,
  Undo,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  exportPinJson,
  expandStrip,
  PART_CATEGORIES,
  parsePinCsv,
  parsePinJson,
  PIN_GENDERS,
  PIN_TYPES,
  setStripCount,
  setStripPitch,
  type Part,
  type Pin,
  type PinGender,
  type PinType,
  type Strip,
  type StripPinOverride,
  type Vec3,
} from '@viz/shared';
import { api, loadAllParts } from '../api';
import { PIN_COLORS, PIN_TYPE_LABELS } from '../lib/pinColors';
import { downloadText, newId, safeFileName } from '../lib/util';
import { PartScene } from '../part/PartScene';
import { mutatePart, openPart, redoPart, savePartNow, schedulePartSave, setPartTool, undoPart, usePartEditor } from '../part/store';
import { setView, Stage, whenStageReady, type StageBridge } from '../three/Stage';
import { Confirm, Loading, Modal, NumberInput, TextInput } from '../ui';
import { Brand } from './Home';

const NORMALS: Array<{ label: string; value: Vec3 }> = [
  { label: 'Up', value: [0, 0, 1] },
  { label: 'Down', value: [0, 0, -1] },
  { label: 'Right (+X)', value: [1, 0, 0] },
  { label: 'Left (−X)', value: [-1, 0, 0] },
  { label: 'Back (+Y)', value: [0, 1, 0] },
  { label: 'Front (−Y)', value: [0, -1, 0] },
];
const normalIndex = (n: Vec3): number => {
  const i = NORMALS.findIndex((o) => o.value.every((c, k) => Math.abs(c - n[k]) < 0.01));
  return i < 0 ? 0 : i;
};
const GENDER_LABELS: Record<PinGender, string> = { male: 'Pin (male)', female: 'Socket (female)', hole: 'Hole' };

function TypeSelect({ value, onChange, disabled, small }: { value: PinType; onChange: (t: PinType) => void; disabled?: boolean; small?: boolean }) {
  return (
    <select className={`input${small ? ' small' : ''}`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as PinType)} aria-label="Pin type">
      {PIN_TYPES.map((t) => (
        <option key={t} value={t}>
          {PIN_TYPE_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

function LimitSelect({ value, onChange, disabled, small }: { value: 3.3 | 5 | undefined; onChange: (v: 3.3 | 5 | undefined) => void; disabled?: boolean; small?: boolean }) {
  return (
    <select
      className={`input${small ? ' small' : ''}`}
      value={value ?? ''}
      disabled={disabled}
      aria-label="Voltage limit"
      title="Auto follows the part's logic voltage: signal pins of a 3.3 V part are 3.3 V only."
      onChange={(e) => onChange(e.target.value === '' ? undefined : (Number(e.target.value) as 3.3 | 5))}
    >
      <option value="">Auto</option>
      <option value="3.3">3.3 V only</option>
      <option value="5">5 V tolerant</option>
    </select>
  );
}

function VecFields({ value, onCommit, labels = ['X', 'Y', 'Z'], disabled, idPrefix }: { value: Vec3; onCommit: (v: Vec3) => void; labels?: string[]; disabled?: boolean; idPrefix: string }) {
  return (
    <div className="field-row three">
      {labels.map((label, k) => (
        <div className="field" key={label}>
          <label htmlFor={`${idPrefix}-${k}`}>{label}</label>
          <NumberInput
            id={`${idPrefix}-${k}`}
            value={value[k]}
            step={0.1}
            disabled={disabled}
            onCommit={(n) => {
              const next: Vec3 = [...value];
              next[k] = n;
              onCommit(next);
            }}
          />
        </div>
      ))}
    </div>
  );
}

function updateStrip(id: string, fn: (s: Strip) => Strip): void {
  mutatePart((p) => {
    const i = p.strips.findIndex((s) => s.id === id);
    if (i >= 0) p.strips[i] = fn(p.strips[i]);
  });
}

function updateOverride(stripId: string, index: number, patch: StripPinOverride): void {
  updateStrip(stripId, (s) => {
    const merged: StripPinOverride = { ...s.overrides[index], ...patch };
    for (const k of Object.keys(merged) as Array<keyof StripPinOverride>) if (merged[k] === undefined) delete merged[k];
    return { ...s, overrides: { ...s.overrides, [index]: merged } };
  });
}

function PinInspector({ pin, readOnly }: { pin: Pin; readOnly: boolean }) {
  const update = (patch: Partial<Pin>) =>
    mutatePart((p) => {
      const target = p.pins.find((x) => x.id === pin.id);
      if (target) Object.assign(target, patch);
    });
  return (
    <div className="side-section">
      <div className="side-head">
        <h3>Pin</h3>
        <div className="spacer" />
        {!readOnly && (
          <button
            className="btn small danger"
            onClick={() => {
              mutatePart((p) => {
                p.pins = p.pins.filter((x) => x.id !== pin.id);
              });
              usePartEditor.setState({ selection: null });
            }}
          >
            <Trash2 /> Delete
          </button>
        )}
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="pin-name">Name</label>
          <TextInput id="pin-name" value={pin.name} disabled={readOnly} onCommit={(name) => update({ name: name.trim() || pin.name })} />
        </div>
        <div className="field">
          <span className="label">Type</span>
          <TypeSelect value={pin.type} disabled={readOnly} onChange={(type) => update({ type })} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="pin-gender">Connector</label>
          <select id="pin-gender" className="input" value={pin.gender} disabled={readOnly} onChange={(e) => update({ gender: e.target.value as PinGender })}>
            {PIN_GENDERS.filter((g) => g !== 'hole').map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="label">Voltage limit</span>
          <LimitSelect value={pin.voltageLimit} disabled={readOnly} onChange={(voltageLimit) => update({ voltageLimit })} />
        </div>
      </div>
      <VecFields idPrefix="pin-pos" value={pin.position} disabled={readOnly} onCommit={(position) => update({ position })} labels={['X (mm)', 'Y (mm)', 'Z (mm)']} />
      <div className="field">
        <label htmlFor="pin-normal">Cable leaves towards</label>
        <select id="pin-normal" className="input" value={normalIndex(pin.normal)} disabled={readOnly} onChange={(e) => update({ normal: NORMALS[Number(e.target.value)].value })}>
          {NORMALS.map((n, i) => (
            <option key={n.label} value={i}>
              {n.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function StripInspector({ strip, readOnly, selectedIndex }: { strip: Strip; readOnly: boolean; selectedIndex?: number }) {
  const keepPitch = usePartEditor((s) => s.keepPitch);
  const slots = strip.count * strip.rows;
  const generated = new Map(expandStrip({ ...strip, overrides: Object.fromEntries(Object.entries(strip.overrides).map(([k, v]) => [k, { ...v, deleted: false }])) }).map((p) => [p.stripIndex!, p]));
  const selectedOverride = selectedIndex !== undefined ? strip.overrides[selectedIndex] : undefined;
  return (
    <>
      <div className="side-section">
        <div className="side-head">
          <h3>Strip</h3>
          <div className="spacer" />
          {!readOnly && (
            <button
              className="btn small danger"
              onClick={() => {
                mutatePart((p) => {
                  p.strips = p.strips.filter((s) => s.id !== strip.id);
                });
                usePartEditor.setState({ selection: null });
              }}
            >
              <Trash2 /> Delete strip
            </button>
          )}
        </div>
        <div className="field-row three">
          <div className="field">
            <label htmlFor="strip-name">Name</label>
            <TextInput id="strip-name" value={strip.name} disabled={readOnly} onCommit={(name) => updateStrip(strip.id, (s) => ({ ...s, name: name.trim() || s.name }))} />
          </div>
          <div className="field">
            <label htmlFor="strip-count">Pins per row</label>
            <NumberInput id="strip-count" value={strip.count} min={1} max={200} digits={0} disabled={readOnly} onCommit={(n) => updateStrip(strip.id, (s) => setStripCount(s, n))} />
          </div>
          <div className="field">
            <label htmlFor="strip-rows">Rows</label>
            <select id="strip-rows" className="input" value={strip.rows} disabled={readOnly} onChange={(e) => updateStrip(strip.id, (s) => ({ ...s, rows: Number(e.target.value) as 1 | 2 }))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
        </div>
        <div className="field-row three">
          <div className="field">
            <label htmlFor="strip-pitch">Pitch (mm)</label>
            <NumberInput id="strip-pitch" value={strip.pitch} min={0.1} step={0.01} disabled={readOnly} onCommit={(n) => updateStrip(strip.id, (s) => setStripPitch(s, n))} />
          </div>
          <div className="field">
            <label htmlFor="strip-rowgap">Row gap (mm)</label>
            <NumberInput id="strip-rowgap" value={strip.rowSpacing} min={0.1} step={0.01} disabled={readOnly || strip.rows === 1} onCommit={(n) => updateStrip(strip.id, (s) => ({ ...s, rowSpacing: n }))} />
          </div>
          <div className="field">
            <label htmlFor="strip-gender">Connector</label>
            <select id="strip-gender" className="input" value={strip.gender} disabled={readOnly} onChange={(e) => updateStrip(strip.id, (s) => ({ ...s, gender: e.target.value as PinGender }))}>
              {PIN_GENDERS.filter((g) => g !== 'hole').map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <VecFields idPrefix="strip-start" value={strip.start} disabled={readOnly} labels={['First pin X', 'Y', 'Z']} onCommit={(start) => updateStrip(strip.id, (s) => ({ ...s, start, end: [s.end[0] + start[0] - s.start[0], s.end[1] + start[1] - s.start[1], s.end[2] + start[2] - s.start[2]] }))} />
        <div className="field-row">
          <div className="field">
            <label htmlFor="strip-normal">Cables leave towards</label>
            <select id="strip-normal" className="input" value={normalIndex(strip.normal)} disabled={readOnly} onChange={(e) => updateStrip(strip.id, (s) => ({ ...s, normal: NORMALS[Number(e.target.value)].value }))}>
              {NORMALS.map((n, i) => (
                <option key={n.label} value={i}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="label">Type for new pins</span>
            <TypeSelect value={strip.type} disabled={readOnly} onChange={(type) => updateStrip(strip.id, (s) => ({ ...s, type }))} />
          </div>
        </div>
        {!readOnly && (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn small" title="Number the pins from the other end" onClick={() => updateStrip(strip.id, (s) => ({ ...s, start: s.end, end: s.start }))}>
                <RefreshCw /> Reverse order
              </button>
              {strip.rows === 2 && (
                <button className="btn small" title="Put the second row on the other side" onClick={() => updateStrip(strip.id, (s) => ({ ...s, flipRows: !s.flipRows }))}>
                  <RefreshCw /> Swap row side
                </button>
              )}
            </div>
            <label className="check hint">
              <input type="checkbox" checked={keepPitch} onChange={(e) => usePartEditor.setState({ keepPitch: e.target.checked })} />
              Dragging an end adds or removes pins (off: stretches the pitch)
            </label>
          </>
        )}
      </div>
      <div className="side-section grow">
        <h3>Pins in this strip ({slots})</h3>
        <table className="data pins">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Name</th>
              <th>Type</th>
              <th>Limit</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: slots }, (_, index) => {
              const ov = strip.overrides[index];
              const pin = generated.get(index)!;
              const deleted = Boolean(ov?.deleted);
              return (
                <tr
                  key={index}
                  className={`${deleted ? 'deleted' : ''}${selectedIndex === index ? ' selected' : ''}`}
                  onFocusCapture={() => usePartEditor.setState({ selection: { kind: 'strip', id: strip.id, index } })}
                >
                  <td className="num">
                    <span className="dot" style={{ background: PIN_COLORS[pin.type], marginRight: 4 }} />
                    {index + 1}
                  </td>
                  <td>
                    <TextInput className="input small" value={pin.name} disabled={readOnly || deleted} aria-label={`Name of pin ${index + 1}`} onCommit={(name) => updateOverride(strip.id, index, { name: name.trim() || undefined })} />
                  </td>
                  <td>
                    <TypeSelect small value={pin.type} disabled={readOnly || deleted} onChange={(type) => updateOverride(strip.id, index, { type })} />
                  </td>
                  <td>
                    <LimitSelect small value={ov?.voltageLimit} disabled={readOnly || deleted} onChange={(voltageLimit) => updateOverride(strip.id, index, { voltageLimit })} />
                  </td>
                  <td>
                    {!readOnly && (
                      <button
                        className="btn ghost icon small"
                        title={deleted ? 'Put this pin back' : 'Remove this pin'}
                        aria-label={deleted ? `Put pin ${index + 1} back` : `Remove pin ${index + 1}`}
                        onClick={() => updateOverride(strip.id, index, { deleted: deleted ? undefined : true })}
                      >
                        {deleted ? <Undo /> : <Trash2 />}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {selectedIndex !== undefined && selectedIndex < slots && !readOnly && (
          <div className="field">
            <span className="label">Nudge pin {selectedIndex + 1} from its place in the strip (mm)</span>
            <VecFields idPrefix="nudge" value={selectedOverride?.offset ?? [0, 0, 0]} onCommit={(offset) => updateOverride(strip.id, selectedIndex, { offset: offset.every((n) => n === 0) ? undefined : offset })} />
          </div>
        )}
      </div>
    </>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = () => {
    const trimmed = text.trim();
    const result = trimmed.startsWith('{') || trimmed.startsWith('[') ? parsePinJson(trimmed, newId) : parsePinCsv(trimmed, newId);
    if (result.errors.length > 0) {
      setErrors(result.errors);
      return;
    }
    mutatePart((p) => {
      if (replace) {
        p.pins = [];
        p.strips = [];
      }
      p.pins.push(...result.pins);
      p.strips.push(...result.strips);
    });
    onClose();
  };

  return (
    <Modal
      title="Import pins"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <FileUp /> Choose a file
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!text.trim()} onClick={run}>
            Import
          </button>
        </>
      }
    >
      <p>
        Paste a pin list, or choose a .csv or .json file. Positions are in millimetres from the centre of the model's base: X to the right, Y to the back, Z up.
      </p>
      <p className="hint">
        CSV columns: <code>name, type, x, y, z</code>, and optionally <code>gender</code> (male or female), <code>nx, ny, nz</code> (direction the cable leaves) and <code>limit</code> (3.3 or 5). Types:{' '}
        {PIN_TYPES.join(', ')}. JSON is the format that Export pins writes.
      </p>
      <textarea
        className="input"
        rows={10}
        value={text}
        placeholder={'name,type,x,y,z\nGND,GND,-10.16,8,5\nVCC,5V,-7.62,8,5\nSDA,I2C_SDA,-5.08,8,5'}
        onChange={(e) => (setText(e.target.value), setErrors([]))}
        aria-label="Pin list"
      />
      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".csv,.json,.txt"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            setText(await file.text());
            setErrors([]);
          }
        }}
      />
      <label className="check">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace the pins and strips this part already has
      </label>
      {errors.length > 0 && (
        <div className="banner" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <strong>Nothing was imported. Fix these and try again:</strong>
          {errors.slice(0, 8).map((e) => (
            <span key={e}>{e}</span>
          ))}
          {errors.length > 8 && <span>and {errors.length - 8} more.</span>}
        </div>
      )}
    </Modal>
  );
}

function SaveStatus() {
  const state = usePartEditor((s) => s.saveState);
  const map = {
    saved: { icon: <Check size={15} />, text: 'Saved', color: 'var(--muted)' },
    unsaved: { icon: <Loader2 size={15} />, text: 'Saving soon…', color: 'var(--muted)' },
    saving: { icon: <Loader2 size={15} />, text: 'Saving…', color: 'var(--muted)' },
    error: { icon: <CloudOff size={15} />, text: 'Cannot reach the server, retrying', color: 'var(--danger)' },
  }[state];
  return (
    <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: map.color, whiteSpace: 'nowrap' }}>
      {map.icon} {map.text}
    </span>
  );
}

function Hint() {
  const tool = usePartEditor((s) => s.tool);
  const stripStart = usePartEditor((s) => s.stripStart);
  const builtin = usePartEditor((s) => Boolean(s.part?.builtin));
  const hasPins = usePartEditor((s) => (s.part ? s.part.pins.length + s.part.strips.length > 0 : false));
  let text: React.ReactNode;
  if (builtin) text = 'This part ships with the app. Hover a pin to see its name.';
  else if (tool === 'pin') text = 'Click the model where the pin is. Keep clicking to add more.';
  else if (tool === 'strip') text = stripStart ? 'Now click the last pin of the row. Hold Alt for a free angle.' : 'Click the first pin of the header row.';
  else if (!hasPins)
    text = (
      <>
        Mark where cables connect: <kbd>S</kbd> adds a whole header strip, <kbd>P</kbd> adds one pin
      </>
    );
  else text = 'Click a pin to edit it · drag to move it · drag the white dots to resize a strip';
  return <div className="status-pill">{text}</div>;
}

export function PartEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bridge: StageBridge = useRef(null);

  const part = usePartEditor((s) => s.part);
  const selection = usePartEditor((s) => s.selection);
  const tool = usePartEditor((s) => s.tool);
  const showNames = usePartEditor((s) => s.showNames);
  const canUndo = usePartEditor((s) => s.past.length > 0);
  const canRedo = usePartEditor((s) => s.future.length > 0);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    loadAllParts()
      .then((parts) => {
        if (!live) return;
        const found = parts.find((p) => p.id === id);
        if (!found) {
          setError('This part no longer exists.');
          setStatus('error');
          return;
        }
        openPart(found);
        document.title = `${found.name} · 3D Setup Visualizer`;
        setStatus('ready');
        whenStageReady(bridge, (state) => setView(state, 'iso', found.bbox));
      })
      .catch((e) => {
        if (!live) return;
        setError((e as Error).message);
        setStatus('error');
      });
    return () => {
      live = false;
    };
  }, [id]);

  // Autosave, and a last save when leaving.
  useEffect(() => {
    if (status !== 'ready') return;
    const unsubscribe = usePartEditor.subscribe((s, prev) => {
      if (s.part !== prev.part && s.part !== s.saved) schedulePartSave();
    });
    return () => {
      unsubscribe();
      void savePartNow();
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'ready') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select') || importing || confirmDelete) return;
      const s = usePartEditor.getState();
      if (!s.part || s.part.builtin) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && key === 'z') {
        e.preventDefault();
        return e.shiftKey ? redoPart() : undoPart();
      }
      if (mod && key === 'y') {
        e.preventDefault();
        return redoPart();
      }
      if (mod || e.altKey) return;
      if (key === 'v') return setPartTool('select');
      if (key === 'p') return setPartTool('pin');
      if (key === 's') return setPartTool('strip');
      if (key === 'escape') {
        if (s.stripStart) usePartEditor.setState({ stripStart: null });
        else if (s.tool !== 'select') setPartTool('select');
        else usePartEditor.setState({ selection: null });
        return;
      }
      if ((key === 'delete' || key === 'backspace') && s.selection) {
        e.preventDefault();
        const sel = s.selection;
        if (sel.kind === 'pin') {
          mutatePart((p) => {
            p.pins = p.pins.filter((x) => x.id !== sel.id);
          });
          usePartEditor.setState({ selection: null });
        } else if (sel.index !== undefined) {
          updateOverride(sel.id, sel.index, { deleted: true });
        } else {
          mutatePart((p) => {
            p.strips = p.strips.filter((x) => x.id !== sel.id);
          });
          usePartEditor.setState({ selection: null });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, importing, confirmDelete]);

  if (status !== 'ready' || !part) {
    return (
      <div className="page">
        <header className="topbar">
          <Brand />
        </header>
        {status === 'error' ? (
          <div className="center-msg solid">
            <p className="error-text">{error}</p>
            <Link className="btn" to="/">
              Back to the library
            </Link>
          </div>
        ) : (
          <Loading label="Opening the part…" />
        )}
      </div>
    );
  }

  const readOnly = Boolean(part.builtin);
  const selectedPin = selection?.kind === 'pin' ? part.pins.find((p) => p.id === selection.id) : undefined;
  const selectedStrip = selection?.kind === 'strip' ? part.strips.find((s) => s.id === selection.id) : undefined;
  const update = (patch: Partial<Part>) => mutatePart((p) => void Object.assign(p, patch));

  const duplicate = async () => {
    try {
      const { id: _id, builtin: _b, thumb: _t, updatedAt: _u, ...rest } = part;
      const copy = await api.createPart({ ...rest, isBreadboard: part.isBreadboard, name: `${part.name} (copy)`, note: `Copied from ${part.name}` });
      navigate(`/parts/${encodeURIComponent(copy.id)}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const done = async () => {
    await savePartNow();
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn ghost icon" onClick={() => void done()} title="Back" aria-label="Back">
          <ArrowLeft />
        </button>
        {readOnly ? (
          <>
            <strong style={{ fontSize: 15 }}>{part.name}</strong>
            <span className="badge">Built-in</span>
          </>
        ) : (
          <TextInput className="name-input" value={part.name} aria-label="Part name" onCommit={(v) => update({ name: v.trim() || part.name })} />
        )}
        {!readOnly && (
          <>
            <div className="sep" />
            <div className="btn-group" role="group" aria-label="Tool">
              <button className={`btn${tool === 'select' ? ' active' : ''}`} onClick={() => setPartTool('select')} title="Select and move pins (V)">
                <MousePointer2 /> Select <kbd>V</kbd>
              </button>
              <button className={`btn${tool === 'strip' ? ' active' : ''}`} onClick={() => setPartTool('strip')} title="Add a row of evenly spaced pins (S)">
                <GripHorizontal /> Add strip <kbd>S</kbd>
              </button>
              <button className={`btn${tool === 'pin' ? ' active' : ''}`} onClick={() => setPartTool('pin')} title="Add single pins (P)">
                <CircleDot /> Add pin <kbd>P</kbd>
              </button>
            </div>
            <div className="sep" />
            <button className="btn ghost icon" onClick={undoPart} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
              <Undo2 />
            </button>
            <button className="btn ghost icon" onClick={redoPart} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
              <Redo2 />
            </button>
          </>
        )}
        <button
          className={`btn ghost icon${showNames ? ' active' : ''}`}
          onClick={() => usePartEditor.setState({ showNames: !showNames })}
          title="Show every pin name"
          aria-label="Show every pin name"
          aria-pressed={showNames}
        >
          <Tag />
        </button>
        <div className="spacer" />
        {!readOnly && <SaveStatus />}
        {readOnly ? (
          <button className="btn primary" onClick={() => void duplicate()}>
            <Copy /> Duplicate to edit
          </button>
        ) : (
          <button className="btn primary" onClick={() => void done()}>
            Done
          </button>
        )}
      </header>

      <div className="workspace">
        <div className={`viewport${tool !== 'select' && !readOnly ? ' wiring' : ''}`}>
          <Stage
            bridge={bridge}
            cameraPosition={[90, -150, 130]}
            onPointerMissed={(e) => {
              if (e.button === 0 && usePartEditor.getState().tool === 'select') usePartEditor.setState({ selection: null });
            }}
          >
            <PartScene />
          </Stage>
          {error && (
            <div className="banner" role="alert" style={{ position: 'absolute', top: 12, left: 12, right: 12 }}>
              <AlertTriangle size={18} /> {error}
            </div>
          )}
          <div className="overlay top-right">
            <div className="floating" role="group" aria-label="View">
              {(['top', 'front', 'iso'] as const).map((v) => (
                <button
                  key={v}
                  className="btn ghost small"
                  onClick={() => {
                    const state = bridge.current?.();
                    if (state) setView(state, v, part.bbox);
                  }}
                >
                  {v === 'iso' ? '3D' : v === 'top' ? 'Top' : 'Front'}
                </button>
              ))}
            </div>
          </div>
          <div className="overlay bottom-center">
            <Hint />
          </div>
        </div>

        <aside className="side right wide" style={{ overflow: 'auto' }}>
          {selectedPin && <PinInspector pin={selectedPin} readOnly={readOnly} />}
          {selectedStrip && <StripInspector strip={selectedStrip} readOnly={readOnly} selectedIndex={selection?.kind === 'strip' ? selection.index : undefined} />}
          {!selectedPin && !selectedStrip && (
            <>
              <div className="side-section">
                <h3>Part</h3>
                {readOnly && <p className="hint">This part ships with the app and cannot be changed. Duplicate it to make your own version, for example to use a better 3D model.</p>}
                {part.note && <p className="hint">{part.note}</p>}
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="pe-category">Category</label>
                    <select id="pe-category" className="input" value={part.category} disabled={readOnly} onChange={(e) => update({ category: e.target.value })}>
                      {[...new Set([...PART_CATEGORIES, part.category])].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="pe-logic">Logic voltage</label>
                    <select id="pe-logic" className="input" value={part.logicVoltage} disabled={readOnly || part.isBreadboard} onChange={(e) => update({ logicVoltage: Number(e.target.value) as 3.3 | 5 })}>
                      <option value={3.3}>3.3 V</option>
                      <option value={5}>5 V</option>
                    </select>
                  </div>
                </div>
                {!part.isBreadboard && (
                  <label className="check">
                    <input type="checkbox" checked={Boolean(part.plugsIntoBreadboard)} disabled={readOnly} onChange={(e) => update({ plugsIntoBreadboard: e.target.checked, plugDepth: e.target.checked ? (part.plugDepth ?? 6) : 0 })} />
                    It plugs into a breadboard
                  </label>
                )}
                {part.plugsIntoBreadboard && (
                  <div className="field">
                    <label htmlFor="pe-depth">Pins sink into the breadboard by (mm)</label>
                    <NumberInput id="pe-depth" value={part.plugDepth ?? 0} min={0} max={20} step={0.5} disabled={readOnly} onCommit={(plugDepth) => update({ plugDepth })} />
                  </div>
                )}
                <dl className="kv">
                  <dt>Size</dt>
                  <dd>
                    {(part.bbox.max[0] - part.bbox.min[0]).toFixed(1)} × {(part.bbox.max[1] - part.bbox.min[1]).toFixed(1)} × {(part.bbox.max[2] - part.bbox.min[2]).toFixed(1)} mm
                  </dd>
                </dl>
                {!readOnly && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Link className="btn small" to={`/parts/new?replace=${encodeURIComponent(part.id)}`}>
                      <RefreshCw /> Replace 3D model
                    </Link>
                    <button className="btn small danger" onClick={() => setConfirmDelete(true)}>
                      <Trash2 /> Delete part
                    </button>
                  </div>
                )}
              </div>
              <div className="side-section grow">
                <div className="side-head">
                  <h3>Pins</h3>
                  <div className="spacer" />
                  {!readOnly && (
                    <button className="btn small" onClick={() => setImporting(true)}>
                      <FileUp /> Import
                    </button>
                  )}
                  <button className="btn small" onClick={() => downloadText(exportPinJson(part.pins, part.strips), `${safeFileName(part.name)}-pins.json`, 'application/json')}>
                    <Download /> Export
                  </button>
                </div>
                {part.strips.length === 0 && part.pins.length === 0 && (
                  <p className="hint">No pins yet. Use Add strip for a header row, or Add pin for single connectors. Cables can only attach to pins.</p>
                )}
                {part.strips.length > 0 && (
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Strip</th>
                        <th className="num">Pins</th>
                        <th>Connector</th>
                      </tr>
                    </thead>
                    <tbody>
                      {part.strips.map((s) => (
                        <tr key={s.id} className="clickable" onClick={() => usePartEditor.setState({ selection: { kind: 'strip', id: s.id }, tool: 'select' })}>
                          <td>
                            <strong>{s.name}</strong>
                          </td>
                          <td className="num">{expandStrip(s).length}</td>
                          <td>{GENDER_LABELS[s.gender]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {part.pins.length > 0 && !part.isBreadboard && (
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Single pin</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {part.pins.map((p) => (
                        <tr key={p.id} className="clickable" onClick={() => usePartEditor.setState({ selection: { kind: 'pin', id: p.id }, tool: 'select' })}>
                          <td>
                            <span className="dot" style={{ background: PIN_COLORS[p.type], marginRight: 6 }} />
                            <strong>{p.name}</strong>
                          </td>
                          <td>{PIN_TYPE_LABELS[p.type]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {part.isBreadboard && <p className="hint">{part.pins.length} holes. Hover a hole to see its name.</p>}
              </div>
            </>
          )}
          {(selectedPin || selectedStrip) && (
            <div className="side-section">
              <button className="btn" onClick={() => usePartEditor.setState({ selection: null })}>
                <ArrowLeft /> All pins and part settings
              </button>
            </div>
          )}
        </aside>
      </div>

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {confirmDelete && (
        <Confirm
          title="Delete this part?"
          message={`"${part.name}" and its 3D model will be removed. Setups that use it will show it as missing, and its cables will be flagged.`}
          confirmLabel="Delete part"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            usePartEditor.setState({ part: null, saved: null });
            await api.deletePart(part.id).catch(() => undefined);
            navigate('/');
          }}
        />
      )}
    </div>
  );
}
