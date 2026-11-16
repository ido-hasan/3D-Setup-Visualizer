import { produce } from 'immer';
import { create } from 'zustand';
import {
  analyse,
  autoCableColor,
  rotZ,
  snapToBreadboard,
  type Analysis,
  type BBox,
  type Cable,
  type Instance,
  type Part,
  type PartsById,
  type PinRef,
  type Setup,
  type SetupDoc,
  type SetupMeta,
  type Vec3,
} from '@viz/shared';
import { newId } from '../lib/util';

export type Selection = { kind: 'instance' | 'cable'; id: string } | null;
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'conflict' | 'error';
export type Tool = 'select' | 'wire';

export interface EditorState {
  setup: SetupMeta | null;
  doc: SetupDoc;
  /** The last version known to be stored on the server. */
  savedDoc: SetupDoc;
  past: SetupDoc[];
  future: SetupDoc[];
  parts: PartsById;
  readOnly: boolean;
  tool: Tool;
  wireFrom: PinRef | null;
  hoverPin: PinRef | null;
  hoverInstance: string | null;
  selection: Selection;
  highlightIssue: string | null;
  snapGrid: boolean;
  showLabels: boolean;
  saveState: SaveState;
  conflict: SetupMeta | null;
}

const EMPTY: SetupDoc = { name: '', instances: [], cables: [] };
export const GRID = 2.54;
const HISTORY_LIMIT = 200;

export const useEditor = create<EditorState>(() => ({
  setup: null,
  doc: EMPTY,
  savedDoc: EMPTY,
  past: [],
  future: [],
  parts: {},
  readOnly: false,
  tool: 'select',
  wireFrom: null,
  hoverPin: null,
  hoverInstance: null,
  selection: null,
  highlightIssue: null,
  snapGrid: true,
  showLabels: true,
  saveState: 'saved',
  conflict: null,
}));

const get = useEditor.getState;
const set = useEditor.setState;
// End-to-end tests read the editor state through this.
(window as unknown as { __vizEditor?: unknown }).__vizEditor = useEditor;

export function loadSetup(setup: Setup, parts: PartsById, readOnly: boolean): void {
  const { doc, ...meta } = setup;
  set({
    setup: meta,
    doc,
    savedDoc: doc,
    past: [],
    future: [],
    parts,
    readOnly,
    tool: 'select',
    wireFrom: null,
    hoverPin: null,
    hoverInstance: null,
    selection: null,
    highlightIssue: null,
    saveState: 'saved',
    conflict: null,
  });
}

// Analysis is recomputed only when the setup or the parts change.
let lastAnalysis: { doc: SetupDoc; parts: PartsById; result: Analysis } | null = null;
export function getAnalysis(doc: SetupDoc = get().doc, parts: PartsById = get().parts): Analysis {
  if (!lastAnalysis || lastAnalysis.doc !== doc || lastAnalysis.parts !== parts) {
    lastAnalysis = { doc, parts, result: analyse(doc, parts) };
  }
  return lastAnalysis.result;
}
export function useAnalysis(): Analysis {
  const doc = useEditor((s) => s.doc);
  const parts = useEditor((s) => s.parts);
  return getAnalysis(doc, parts);
}

// History

/** Change the setup. Transient changes (while dragging) do not add an undo step. */
export function mutate(fn: (doc: SetupDoc) => void, transient = false): void {
  const s = get();
  if (s.readOnly) return;
  const next = produce(s.doc, fn);
  if (next === s.doc) return;
  set(transient ? { doc: next } : { doc: next, past: [...s.past.slice(-HISTORY_LIMIT + 1), s.doc], future: [] });
}

let gestureBase: SetupDoc | null = null;

/** Start a drag. Everything until endGesture becomes one undo step. */
export function beginGesture(): void {
  const s = get();
  if (s.readOnly || gestureBase) return;
  gestureBase = s.doc;
  set({ past: [...s.past.slice(-HISTORY_LIMIT + 1), s.doc], future: [] });
}

export function endGesture(): void {
  const s = get();
  if (gestureBase && gestureBase === s.doc) set({ past: s.past.slice(0, -1) });
  gestureBase = null;
}

function keepSelection(doc: SetupDoc, sel: Selection): Selection {
  if (!sel) return null;
  const list: Array<{ id: string }> = sel.kind === 'instance' ? doc.instances : doc.cables;
  return list.some((x) => x.id === sel.id) ? sel : null;
}

export function undo(): void {
  const s = get();
  const prev = s.past.at(-1);
  if (!prev || s.readOnly) return;
  set({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], wireFrom: null, selection: keepSelection(prev, s.selection) });
}

export function redo(): void {
  const s = get();
  const next = s.future[0];
  if (!next || s.readOnly) return;
  set({ doc: next, past: [...s.past, s.doc], future: s.future.slice(1), wireFrom: null, selection: keepSelection(next, s.selection) });
}

// Tools and selection

export function setTool(tool: Tool): void {
  set({ tool, wireFrom: null, hoverPin: null, ...(tool === 'wire' ? { selection: null } : {}) });
}

export function select(selection: Selection): void {
  set({ selection });
}

/** Esc: drop the cable being drawn, then leave the wire tool, then clear the selection. */
export function escape(): void {
  const s = get();
  if (s.wireFrom) set({ wireFrom: null });
  else if (s.tool === 'wire') setTool('select');
  else set({ selection: null });
}

// Parts on the bench

/** The area of the bench an instance covers. */
export function footprint(inst: Pick<Instance, 'x' | 'y' | 'z' | 'rotZ'>, part: Part | undefined): BBox {
  const b = part?.bbox ?? { min: [-10, -10, 0], max: [10, 10, 5] };
  const xs: number[] = [];
  const ys: number[] = [];
  for (const cx of [b.min[0], b.max[0]])
    for (const cy of [b.min[1], b.max[1]]) {
      const [x, y] = rotZ([cx, cy, 0], inst.rotZ);
      xs.push(x + inst.x);
      ys.push(y + inst.y);
    }
  return { min: [Math.min(...xs), Math.min(...ys), inst.z + b.min[2]], max: [Math.max(...xs), Math.max(...ys), inst.z + b.max[2]] };
}

export function sceneBounds(doc: SetupDoc, parts: PartsById): BBox | undefined {
  if (doc.instances.length === 0) return undefined;
  const min: Vec3 = [Infinity, Infinity, 0];
  const max: Vec3 = [-Infinity, -Infinity, 10];
  for (const inst of doc.instances) {
    const f = footprint(inst, parts[inst.partId]);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], f.min[k]);
      max[k] = Math.max(max[k], f.max[k]);
    }
  }
  return { min, max };
}

function uniqueName(doc: SetupDoc, base: string): string {
  const names = new Set(doc.instances.map((i) => i.name));
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** A clear spot near (x, y): slide right past whatever is in the way, then start a new row. */
function freeSpot(doc: SetupDoc, parts: PartsById, part: Part, x: number, y: number): { x: number; y: number } {
  const others = doc.instances.map((i) => footprint(i, parts[i.partId]));
  const gap = 8;
  const hitAt = (cx: number, cy: number): BBox | undefined => {
    const f = footprint({ x: cx, y: cy, z: 0, rotZ: 0 }, part);
    return others.find((o) => f.min[0] < o.max[0] + gap && f.max[0] > o.min[0] - gap && f.min[1] < o.max[1] + gap && f.max[1] > o.min[1] - gap);
  };
  const depth = part.bbox.max[1] - part.bbox.min[1];
  let cy = y;
  for (let row = 0; row < 6; row++) {
    let cx = x;
    for (let tries = 0; tries < 12; tries++) {
      const hit = hitAt(cx, cy);
      if (!hit) return { x: cx, y: cy };
      cx = hit.max[0] + gap - part.bbox.min[0] + 0.01;
    }
    cy -= depth + 60;
  }
  return { x, y };
}

const snapXY = (v: number): number => Math.round(v / GRID) * GRID;

export function addInstance(partId: string, at?: { x: number; y: number }, exact = false): string | undefined {
  const s = get();
  const part = s.parts[partId];
  if (!part || s.readOnly) return undefined;
  const spot = exact && at ? at : freeSpot(s.doc, s.parts, part, at?.x ?? 0, at?.y ?? 0);
  const inst: Instance = {
    id: newId(),
    partId,
    name: uniqueName(s.doc, part.name),
    x: s.snapGrid ? snapXY(spot.x) : spot.x,
    y: s.snapGrid ? snapXY(spot.y) : spot.y,
    z: 0,
    rotZ: 0,
  };
  const seat = snapToBreadboard(inst, s.doc, s.parts, 1.9);
  if (seat) Object.assign(inst, { x: seat.x, y: seat.y, z: seat.z });
  mutate((d) => {
    d.instances.push(inst);
  });
  set({ selection: { kind: 'instance', id: inst.id }, tool: 'select', wireFrom: null });
  return inst.id;
}

/** Boards plugged into a breadboard travel with it. */
export function passengersOf(instanceId: string): string[] {
  const { netlist, index } = getAnalysis();
  if (!index.partOf(instanceId)?.isBreadboard) return [];
  return [...new Set(netlist.snaps.filter((sn) => sn.hole.instanceId === instanceId).map((sn) => sn.pin.instanceId))];
}

function shiftGroup(d: SetupDoc, ids: Set<string>, move: (p: { x: number; y: number }) => { x: number; y: number }): void {
  for (const cable of d.cables) {
    if (!ids.has(cable.from.instanceId) || !ids.has(cable.to.instanceId)) continue;
    cable.controlPoints = cable.controlPoints.map((cp) => {
      const p = move({ x: cp[0], y: cp[1] });
      return [p.x, p.y, cp[2]];
    });
  }
}

/** Move an instance to (x, y), snapping to the grid and into breadboard holes. Used while dragging. */
export function dragInstanceTo(id: string, x: number, y: number, passengers: string[], useGrid: boolean): void {
  const s = get();
  mutate((d) => {
    const inst = d.instances.find((i) => i.id === id);
    if (!inst) return;
    const part = s.parts[inst.partId];
    let nx = useGrid ? snapXY(x) : x;
    let ny = useGrid ? snapXY(y) : y;
    let nz = inst.z;
    if (part?.plugsIntoBreadboard) {
      const seat = snapToBreadboard({ ...inst, x, y }, d, s.parts, 1.9);
      if (seat) [nx, ny, nz] = [seat.x, seat.y, seat.z];
      else nz = 0;
    }
    const dx = nx - inst.x;
    const dy = ny - inst.y;
    inst.x = nx;
    inst.y = ny;
    inst.z = nz;
    for (const p of d.instances) {
      if (passengers.includes(p.id)) {
        p.x += dx;
        p.y += dy;
      }
    }
    shiftGroup(d, new Set([id, ...passengers]), (p) => ({ x: p.x + dx, y: p.y + dy }));
  }, true);
}

export function updateInstance(id: string, patch: Partial<Pick<Instance, 'name' | 'x' | 'y' | 'z' | 'rotZ'>>): void {
  mutate((d) => {
    const inst = d.instances.find((i) => i.id === id);
    if (inst) Object.assign(inst, patch);
  });
}

export function rotateInstance(id: string, delta = 90): void {
  const s = get();
  const passengers = passengersOf(id);
  mutate((d) => {
    const inst = d.instances.find((i) => i.id === id);
    if (!inst) return;
    const turn = (p: { x: number; y: number }) => {
      const [rx, ry] = rotZ([p.x - inst.x, p.y - inst.y, 0], delta);
      return { x: inst.x + rx, y: inst.y + ry };
    };
    inst.rotZ = (((inst.rotZ + delta) % 360) + 360) % 360;
    for (const p of d.instances) {
      if (!passengers.includes(p.id)) continue;
      Object.assign(p, turn(p));
      p.rotZ = (((p.rotZ + delta) % 360) + 360) % 360;
    }
    shiftGroup(d, new Set([id, ...passengers]), turn);
    // A plugged-in board that turns must land in holes again.
    const seat = snapToBreadboard(inst, d, s.parts, 1.9);
    if (seat) Object.assign(inst, { x: seat.x, y: seat.y, z: seat.z });
  });
}

export function deleteSelection(): void {
  const s = get();
  const sel = s.selection;
  if (!sel || s.readOnly) return;
  mutate((d) => {
    if (sel.kind === 'instance') {
      d.instances = d.instances.filter((i) => i.id !== sel.id);
      d.cables = d.cables.filter((c) => c.from.instanceId !== sel.id && c.to.instanceId !== sel.id);
    } else {
      d.cables = d.cables.filter((c) => c.id !== sel.id);
    }
  });
  set({ selection: null });
}

export function duplicateSelection(): void {
  const s = get();
  if (s.selection?.kind !== 'instance') return;
  const src = s.doc.instances.find((i) => i.id === s.selection!.id);
  if (!src) return;
  const copy: Instance = { ...src, id: newId(), name: uniqueName(s.doc, s.parts[src.partId]?.name ?? src.name), x: src.x + 4 * GRID, y: src.y - 4 * GRID, z: 0 };
  mutate((d) => {
    d.instances.push(copy);
  });
  set({ selection: { kind: 'instance', id: copy.id } });
}

export function nudgeSelection(dx: number, dy: number): void {
  const s = get();
  if (s.selection?.kind !== 'instance') return;
  const inst = s.doc.instances.find((i) => i.id === s.selection!.id);
  if (!inst) return;
  const passengers = passengersOf(inst.id);
  mutate((d) => {
    for (const p of d.instances) {
      if (p.id === inst.id || passengers.includes(p.id)) {
        p.x += dx;
        p.y += dy;
      }
    }
    shiftGroup(d, new Set([inst.id, ...passengers]), (p) => ({ x: p.x + dx, y: p.y + dy }));
  });
}

// Cables

const samePin = (a: PinRef, b: PinRef): boolean => a.instanceId === b.instanceId && a.pinId === b.pinId;

/** Wire tool: the first click picks the start, the second click makes the cable. */
export function pickPin(ref: PinRef): void {
  const s = get();
  if (s.readOnly) return;
  if (!s.wireFrom) {
    set({ wireFrom: ref, selection: null });
    return;
  }
  if (samePin(s.wireFrom, ref)) {
    set({ wireFrom: null });
    return;
  }
  const from = s.wireFrom;
  const exists = s.doc.cables.some((c) => (samePin(c.from, from) && samePin(c.to, ref)) || (samePin(c.from, ref) && samePin(c.to, from)));
  if (!exists) {
    const { index } = getAnalysis();
    const a = index.resolve(from);
    const b = index.resolve(ref);
    if (a && b) {
      const cable: Cable = {
        id: newId(),
        from,
        to: ref,
        color: autoCableColor(a.pin.type, b.pin.type, s.doc.cables),
        autoColor: true,
        label: '',
        controlPoints: [],
      };
      mutate((d) => {
        d.cables.push(cable);
      });
    }
  }
  set({ wireFrom: null });
}

export function updateCable(id: string, patch: Partial<Pick<Cable, 'color' | 'label' | 'autoColor' | 'controlPoints'>>, transient = false): void {
  mutate((d) => {
    const cable = d.cables.find((c) => c.id === id);
    if (cable) Object.assign(cable, patch);
  }, transient);
}

export function setName(name: string): void {
  mutate((d) => {
    d.name = name;
  });
}
