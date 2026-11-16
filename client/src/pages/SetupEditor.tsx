import {
  AlertTriangle,
  ArrowLeft,
  Cable as CableIcon,
  Camera,
  Check,
  ChevronDown,
  CloudOff,
  Eye,
  ListChecks,
  Loader2,
  Magnet,
  MousePointer2,
  Redo2,
  Share2,
  Table2,
  Tag,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { api, byId, loadAllParts } from '../api';
import { downloadBlob, safeFileName, timeAgo } from '../lib/util';
import { saveNow, scheduleSave, cancelScheduledSave, setThumbProvider } from '../setup/autosave';
import { BomDialog, ShareDialog, WiringDialog } from '../setup/dialogs';
import { Inspector, PART_DRAG_TYPE, PartsPanel } from '../setup/panels';
import { Scene } from '../setup/Scene';
import {
  addInstance,
  deleteSelection,
  duplicateSelection,
  escape,
  footprint,
  getAnalysis,
  GRID,
  loadSetup,
  nudgeSelection,
  redo,
  rotateInstance,
  sceneBounds,
  select,
  setName,
  setTool,
  undo,
  useAnalysis,
  useEditor,
} from '../setup/store';
import { screenToPlane, setView, Stage, whenStageReady, type StageBridge, type ViewName } from '../three/Stage';
import { Loading, Menu, TextInput } from '../ui';
import { Brand } from './Home';

type Dialog = 'wiring' | 'bom' | 'share' | null;

function SaveStatus() {
  const state = useEditor((s) => s.saveState);
  const map = {
    saved: { icon: <Check size={15} />, text: 'Saved', color: 'var(--muted)' },
    unsaved: { icon: <Loader2 size={15} />, text: 'Saving soon…', color: 'var(--muted)' },
    saving: { icon: <Loader2 size={15} />, text: 'Saving…', color: 'var(--muted)' },
    conflict: { icon: <AlertTriangle size={15} />, text: 'Not saved', color: 'var(--danger)' },
    error: { icon: <CloudOff size={15} />, text: 'Cannot reach the server, retrying', color: 'var(--danger)' },
  }[state];
  return (
    <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: map.color, whiteSpace: 'nowrap' }}>
      {map.icon} {map.text}
    </span>
  );
}

function StatusHint() {
  const tool = useEditor((s) => s.tool);
  const wireFrom = useEditor((s) => s.wireFrom);
  const empty = useEditor((s) => s.doc.instances.length === 0);
  const selection = useEditor((s) => s.selection);
  const readOnly = useEditor((s) => s.readOnly);
  if (readOnly) return <div className="status-pill">Drag to look around · scroll to zoom · right-drag to pan</div>;
  if (empty) return null;
  let text: React.ReactNode;
  if (tool === 'wire') {
    text = wireFrom ? (
      <>
        Now click the pin to connect to · <kbd>Esc</kbd> cancels
      </>
    ) : (
      <>
        Click a pin to start a cable · <kbd>Esc</kbd> to stop wiring
      </>
    );
  } else if (selection?.kind === 'instance') {
    text = (
      <>
        Drag to move · <kbd>R</kbd> rotate · <kbd>Del</kbd> delete · <kbd>W</kbd> draw cables
      </>
    );
  } else if (selection?.kind === 'cable') {
    text = (
      <>
        Drag the white dot to route the cable · <kbd>Del</kbd> delete
      </>
    );
  } else {
    text = (
      <>
        Drag boards to move them · press <kbd>W</kbd> to draw cables · drag the background to look around
      </>
    );
  }
  return <div className="status-pill">{text}</div>;
}

function ConflictBanner({ onReload }: { onReload: () => void }) {
  const conflict = useEditor((s) => s.conflict);
  const state = useEditor((s) => s.saveState);
  if (state !== 'conflict' || !conflict) return null;
  return (
    <div className="banner warn" role="alert" style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 20 }}>
      <AlertTriangle size={18} />
      <span>
        <strong>Someone else saved this setup {timeAgo(conflict.updatedAt)}.</strong> Your changes are not saved yet. Pick which version to keep.
      </span>
      <div className="spacer" />
      <button className="btn small" onClick={onReload}>
        Load their version
      </button>
      <button className="btn small primary" onClick={() => void saveNow({ force: true })}>
        Keep mine
      </button>
    </div>
  );
}

export function SetupEditor({ shared = false }: { shared?: boolean }) {
  const { id, token } = useParams();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dropping, setDropping] = useState(false);
  const bridge: StageBridge = useRef(null);

  const tool = useEditor((s) => s.tool);
  const name = useEditor((s) => s.doc.name);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const snapGrid = useEditor((s) => s.snapGrid);
  const showLabels = useEditor((s) => s.showLabels);
  const empty = useEditor((s) => s.doc.instances.length === 0);
  const readOnly = useEditor((s) => s.readOnly);
  const issueCount = useAnalysis().issues.length;

  const frame = useCallback((view: ViewName) => {
    const state = bridge.current?.();
    if (!state) return;
    const s = useEditor.getState();
    setView(state, view, sceneBounds(s.doc, s.parts) ?? { min: [-60, -40, 0], max: [60, 40, 20] });
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [setup, parts] = await Promise.all([shared ? api.getShared(token!) : api.getSetup(id!), loadAllParts()]);
      loadSetup(setup, byId(parts), shared);
      document.title = `${setup.name} · 3D Setup Visualizer`;
      setStatus('ready');
      // Frame the bench once the canvas exists.
      whenStageReady(bridge, () => frame('iso'));
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }, [id, token, shared, frame]);

  useEffect(() => {
    void load();
  }, [load]);

  // Autosave: two seconds after the last change, and when leaving the page.
  useEffect(() => {
    if (shared || status !== 'ready') return;
    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (s.doc !== prev.doc && s.doc !== s.savedDoc) scheduleSave();
    });
    const flush = () => void saveNow({ keepalive: true });
    window.addEventListener('pagehide', flush);
    setThumbProvider(() => {
      const canvas = bridge.current?.().gl.domElement;
      if (!canvas || canvas.width === 0) return undefined;
      const out = document.createElement('canvas');
      out.width = 400;
      out.height = 300;
      const scale = Math.max(out.width / canvas.width, out.height / canvas.height);
      const w = canvas.width * scale;
      const h = canvas.height * scale;
      out.getContext('2d')!.drawImage(canvas, (out.width - w) / 2, (out.height - h) / 2, w, h);
      return out.toDataURL('image/jpeg', 0.72);
    });
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      cancelScheduledSave();
      void saveNow();
      setThumbProvider(null);
    };
  }, [shared, status]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (status !== 'ready') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]') || dialog) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (key === 'escape') return escape();
      if (s.readOnly) return;
      const selectedInstance = s.selection?.kind === 'instance' ? s.selection.id : null;
      if (mod && key === 'z') {
        e.preventDefault();
        return e.shiftKey ? redo() : undo();
      }
      if (mod && key === 'y') {
        e.preventDefault();
        return redo();
      }
      if (mod && key === 'd') {
        e.preventDefault();
        return duplicateSelection();
      }
      if (mod || e.altKey) return;
      if (key === 'v') return setTool('select');
      if (key === 'w' || key === 'c') return setTool('wire');
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        return deleteSelection();
      }
      if (key === 'r' && selectedInstance) return rotateInstance(selectedInstance, e.shiftKey ? -90 : 90);
      if (key === 'g') return useEditor.setState({ snapGrid: !s.snapGrid });
      if (key === 'l') return useEditor.setState({ showLabels: !s.showLabels });
      const step = e.shiftKey ? GRID * 5 : GRID;
      const arrows: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, step], arrowdown: [0, -step] };
      if (arrows[key] && selectedInstance) {
        e.preventDefault();
        nudgeSelection(...arrows[key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, dialog]);

  const viewCenter = (): { x: number; y: number } => {
    const controls = bridge.current?.().controls as unknown as OrbitControlsImpl | undefined;
    return controls ? { x: controls.target.x, y: controls.target.y } : { x: 0, y: 0 };
  };

  // A part added with a click may land outside the picture. If it does, zoom out to show everything.
  const addFromLibrary = (partId: string) => {
    const newId = addInstance(partId, viewCenter());
    const state = bridge.current?.();
    const s = useEditor.getState();
    const inst = s.doc.instances.find((i) => i.id === newId);
    if (!state || !inst) return;
    const f = footprint(inst, s.parts[inst.partId]);
    const onScreen = [f.min, f.max].every((corner) => {
      const v = new THREE.Vector3(corner[0], corner[1], corner[2]).project(state.camera);
      return Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.9;
    });
    if (!onScreen) frame('current');
  };

  const onDrop = (e: DragEvent) => {
    setDropping(false);
    const partId = e.dataTransfer.getData(PART_DRAG_TYPE);
    const state = bridge.current?.();
    if (!partId || !state) return;
    e.preventDefault();
    const p = screenToPlane(state, e.clientX, e.clientY, 0);
    if (p) addInstance(partId, { x: p.x, y: p.y }, true);
  };

  const screenshot = async () => {
    const state = bridge.current?.();
    if (!state) return;
    // Take the picture without selection outlines or hover marks.
    useEditor.setState({ selection: null, hoverPin: null, hoverInstance: null, wireFrom: null, highlightIssue: null });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const gl = state.gl.domElement;
    const out = document.createElement('canvas');
    out.width = gl.width;
    out.height = gl.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(gl, 0, 0);
    // Cable labels are page elements, so they are drawn onto the picture here.
    const s = useEditor.getState();
    if (s.showLabels) {
      const { index } = getAnalysis();
      const ratio = gl.width / gl.clientWidth;
      ctx.font = `${12 * ratio}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const cable of s.doc.cables) {
        if (!cable.label) continue;
        const a = index.resolve(cable.from);
        const b = index.resolve(cable.to);
        if (!a || !b) continue;
        const mid = cable.controlPoints.length
          ? cable.controlPoints[Math.floor(cable.controlPoints.length / 2)]
          : [(a.position[0] + b.position[0]) / 2, (a.position[1] + b.position[1]) / 2, Math.max(a.position[2], b.position[2]) + 25];
        const v = new THREE.Vector3(mid[0], mid[1], mid[2]).project(state.camera);
        const x = ((v.x + 1) / 2) * gl.width;
        const y = ((1 - v.y) / 2) * gl.height;
        const w = ctx.measureText(cable.label).width + 12 * ratio;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#c5ccd6';
        ctx.lineWidth = ratio;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - 9 * ratio, w, 18 * ratio, 4 * ratio);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1b2330';
        ctx.fillText(cable.label, x, y);
      }
    }
    out.toBlob((blob) => blob && downloadBlob(blob, `${safeFileName(s.doc.name)}.png`), 'image/png');
  };

  if (status !== 'ready') {
    return (
      <div className="page">
        <header className="topbar">
          <Brand />
        </header>
        {status === 'loading' ? (
          <Loading label="Opening the setup…" />
        ) : (
          <div className="center-msg solid">
            <p className="error-text">{error}</p>
            <Link className="btn" to="/">
              Back to setups
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        {readOnly ? (
          <>
            <Brand />
            <div className="sep" />
            <strong style={{ fontSize: 15 }}>{name}</strong>
            <span className="badge">
              <Eye size={13} /> View only
            </span>
          </>
        ) : (
          <>
            <Link className="btn ghost icon" to="/" title="Back to setups" aria-label="Back to setups">
              <ArrowLeft />
            </Link>
            <TextInput className="name-input" value={name} aria-label="Setup name" onCommit={(v) => setName(v.trim() || 'Untitled setup')} />
            <div className="sep" />
            <div className="btn-group" role="group" aria-label="Tool">
              <button className={`btn${tool === 'select' ? ' active' : ''}`} onClick={() => setTool('select')} title="Move boards and select cables (V)">
                <MousePointer2 /> Select <kbd>V</kbd>
              </button>
              <button className={`btn${tool === 'wire' ? ' active' : ''}`} onClick={() => setTool('wire')} title="Draw cables from pin to pin (W)">
                <CableIcon /> Wire <kbd>W</kbd>
              </button>
            </div>
            <div className="sep" />
            <button className="btn ghost icon" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
              <Undo2 />
            </button>
            <button className="btn ghost icon" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
              <Redo2 />
            </button>
            <div className="sep" />
            <button
              className={`btn ghost icon${snapGrid ? ' active' : ''}`}
              onClick={() => useEditor.setState({ snapGrid: !snapGrid })}
              title="Snap to a 2.54 mm grid (G). Hold Alt while dragging to move freely."
              aria-label="Snap to grid"
              aria-pressed={snapGrid}
            >
              <Magnet />
            </button>
          </>
        )}
        <button
          className={`btn ghost icon${showLabels ? ' active' : ''}`}
          onClick={() => useEditor.setState({ showLabels: !showLabels })}
          title="Show cable labels (L)"
          aria-label="Show cable labels"
          aria-pressed={showLabels}
        >
          <Tag />
        </button>
        <div className="spacer" />
        {!readOnly && <SaveStatus />}
        {issueCount > 0 && (
          <span className="badge warn" title="See Checks in the right panel">
            <AlertTriangle size={13} /> {issueCount} {issueCount === 1 ? 'problem' : 'problems'}
          </span>
        )}
        <Menu
          label={
            <>
              Export <ChevronDown />
            </>
          }
        >
          {(close) => (
            <>
              <button className="btn ghost" onClick={() => (close(), void screenshot())}>
                <Camera /> Screenshot (PNG)
              </button>
              <button className="btn ghost" onClick={() => (close(), setDialog('wiring'))}>
                <Table2 /> Wiring list
              </button>
              <button className="btn ghost" onClick={() => (close(), setDialog('bom'))}>
                <ListChecks /> Bill of materials
              </button>
              {!readOnly && (
                <button className="btn ghost" onClick={() => (close(), setDialog('share'))}>
                  <Share2 /> Share view-only link
                </button>
              )}
            </>
          )}
        </Menu>
      </header>

      <div className="workspace">
        {!readOnly && <PartsPanel onAdd={addFromLibrary} />}
        <div
          className={`viewport${tool === 'wire' ? ' wiring' : ''}${dropping ? ' drop-target' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(PART_DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={onDrop}
        >
          <Stage
            bridge={bridge}
            onPointerMissed={(e) => {
              if (e.button !== 0) return;
              const s = useEditor.getState();
              if (s.wireFrom) useEditor.setState({ wireFrom: null });
              else select(null);
              if (s.highlightIssue) useEditor.setState({ highlightIssue: null });
            }}
          >
            <Scene />
          </Stage>
          <ConflictBanner onReload={() => void load()} />
          {empty && (
            <div className="center-msg">
              <h2>{readOnly ? 'This setup is empty' : 'The bench is empty'}</h2>
              {!readOnly && <p>Click a part on the left to put it on the bench, or drag it here.</p>}
            </div>
          )}
          <div className="overlay top-right">
            <div className="floating" role="group" aria-label="View">
              <button className="btn ghost small" onClick={() => frame('top')}>
                Top
              </button>
              <button className="btn ghost small" onClick={() => frame('front')}>
                Front
              </button>
              <button className="btn ghost small" onClick={() => frame('iso')}>
                3D
              </button>
            </div>
          </div>
          <div className="overlay bottom-center">
            <StatusHint />
          </div>
        </div>
        <Inspector />
      </div>

      {dialog === 'wiring' && <WiringDialog onClose={() => setDialog(null)} />}
      {dialog === 'bom' && <BomDialog onClose={() => setDialog(null)} />}
      {dialog === 'share' && <ShareDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
