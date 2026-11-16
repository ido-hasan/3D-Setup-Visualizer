import type { Cable, Instance, Part, PartsById, Pin, PinRef, SetupDoc, Vec3 } from './types';
import { add, rotZ } from './vec';
import { partPinMap, partPins } from './strip';
import { BREADBOARD_HEIGHT } from './breadboard';

/** Position of a part-local point on the bench. */
export function toWorld(instance: Instance, local: Vec3): Vec3 {
  return add(rotZ(local, instance.rotZ), [instance.x, instance.y, instance.z]);
}

export function toLocal(instance: Instance, world: Vec3): Vec3 {
  return rotZ([world[0] - instance.x, world[1] - instance.y, world[2] - instance.z], -instance.rotZ);
}

export interface ResolvedPin {
  ref: PinRef;
  key: string;
  pin: Pin;
  part: Part;
  instance: Instance;
  position: Vec3;
  normal: Vec3;
}

export const pinKey = (ref: PinRef): string => `${ref.instanceId}/${ref.pinId}`;

/** Fast lookups for one version of a setup. */
export class SetupIndex {
  readonly instances = new Map<string, Instance>();

  constructor(
    readonly doc: SetupDoc,
    readonly parts: PartsById,
  ) {
    for (const inst of doc.instances) this.instances.set(inst.id, inst);
  }

  partOf(instanceId: string): Part | undefined {
    const inst = this.instances.get(instanceId);
    return inst ? this.parts[inst.partId] : undefined;
  }

  resolve(ref: PinRef): ResolvedPin | undefined {
    const instance = this.instances.get(ref.instanceId);
    if (!instance) return undefined;
    const part = this.parts[instance.partId];
    if (!part) return undefined;
    const pin = partPinMap(part).get(ref.pinId);
    if (!pin) return undefined;
    return {
      ref,
      key: pinKey(ref),
      pin,
      part,
      instance,
      position: toWorld(instance, pin.position),
      normal: rotZ(pin.normal, instance.rotZ),
    };
  }

  /** A short name for messages and tables, e.g. "Arduino Uno R3 · D2". */
  describe(ref: PinRef): string {
    const r = this.resolve(ref);
    if (r) return `${r.instance.name} · ${r.pin.name}`;
    const inst = this.instances.get(ref.instanceId);
    return inst ? `${inst.name} · (missing pin)` : '(missing part)';
  }
}

/** A male pin sitting in a breadboard hole. */
export interface Snap {
  pin: PinRef;
  hole: PinRef;
}

const SNAP_TOLERANCE = 0.6;
const GRID = 1.27;

const holeGridCache = new WeakMap<Part, Map<string, Pin>>();

function holeGrid(part: Part): Map<string, Pin> {
  let grid = holeGridCache.get(part);
  if (!grid) {
    grid = new Map();
    for (const pin of partPins(part)) {
      if (pin.gender !== 'hole') continue;
      grid.set(`${Math.round(pin.position[0] / GRID)},${Math.round(pin.position[1] / GRID)}`, pin);
    }
    holeGridCache.set(part, grid);
  }
  return grid;
}

/** The nearest breadboard hole to a bench position, if one lies within tolerance. */
export function holeAt(breadboard: Instance, part: Part, world: Vec3, tolerance = SNAP_TOLERANCE): Pin | undefined {
  const local = toLocal(breadboard, world);
  const grid = holeGrid(part);
  const cx = Math.round(local[0] / GRID);
  const cy = Math.round(local[1] / GRID);
  const reach = Math.ceil(tolerance / GRID);
  let best: Pin | undefined;
  let bestDist = tolerance;
  for (let ix = cx - reach; ix <= cx + reach; ix++) {
    for (let iy = cy - reach; iy <= cy + reach; iy++) {
      const hole = grid.get(`${ix},${iy}`);
      if (!hole) continue;
      const d = Math.hypot(hole.position[0] - local[0], hole.position[1] - local[1]);
      if (d <= bestDist) {
        best = hole;
        bestDist = d;
      }
    }
  }
  return best;
}

/**
 * Find boards plugged into breadboards. A board counts as plugged in when at least two of its
 * male pins sit over holes of the same breadboard.
 */
export function findSnaps(doc: SetupDoc, parts: PartsById): Snap[] {
  const snaps: Snap[] = [];
  const breadboards = doc.instances.filter((i) => parts[i.partId]?.isBreadboard);
  if (breadboards.length === 0) return snaps;
  for (const inst of doc.instances) {
    const part = parts[inst.partId];
    if (!part || part.isBreadboard || !part.plugsIntoBreadboard) continue;
    const malePins = partPins(part).filter((p) => p.gender === 'male');
    for (const bb of breadboards) {
      const bbPart = parts[bb.partId];
      const found: Snap[] = [];
      for (const pin of malePins) {
        const hole = holeAt(bb, bbPart, toWorld(inst, pin.position));
        if (hole) found.push({ pin: { instanceId: inst.id, pinId: pin.id }, hole: { instanceId: bb.id, pinId: hole.id } });
      }
      if (found.length >= 2) snaps.push(...found);
    }
  }
  return snaps;
}

/**
 * Where a dragged board should land so its pins drop into breadboard holes.
 * Returns undefined when it is not over a breadboard.
 */
export function snapToBreadboard(
  moving: Instance,
  doc: SetupDoc,
  parts: PartsById,
  reach = 1.5,
): { x: number; y: number; z: number; breadboardId: string } | undefined {
  const part = parts[moving.partId];
  if (!part?.plugsIntoBreadboard) return undefined;
  const malePins = partPins(part).filter((p) => p.gender === 'male');
  if (malePins.length === 0) return undefined;
  for (const bb of doc.instances) {
    const bbPart = parts[bb.partId];
    if (!bbPart?.isBreadboard || bb.id === moving.id) continue;
    // Use the first pin over a hole as the anchor, then check the offset suits the other pins.
    for (const anchor of malePins) {
      const world = toWorld(moving, anchor.position);
      const hole = holeAt(bb, bbPart, world, reach);
      if (!hole) continue;
      const target = toWorld(bb, hole.position);
      const dx = target[0] - world[0];
      const dy = target[1] - world[1];
      const moved: Instance = { ...moving, x: moving.x + dx, y: moving.y + dy };
      let seated = 0;
      for (const pin of malePins) if (holeAt(bb, bbPart, toWorld(moved, pin.position), 0.3)) seated++;
      if (seated >= Math.min(2, malePins.length)) {
        return {
          x: moved.x,
          y: moved.y,
          z: bb.z + BREADBOARD_HEIGHT - (part.plugDepth ?? 0),
          breadboardId: bb.id,
        };
      }
      break;
    }
  }
  return undefined;
}

export interface Net {
  id: number;
  /** Every pin on the net that a cable or a plugged-in board touches. */
  pins: ResolvedPin[];
  cableIds: string[];
}

export interface Netlist {
  nets: Net[];
  snaps: Snap[];
  /** Cables whose part or pin no longer exists. */
  dangling: Cable[];
  netOfPin: Map<string, Net>;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(k: string): string {
    if (!this.parent.has(k)) {
      this.parent.set(k, k);
      return k;
    }
    let root = k;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = k;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Work out which pins are electrically joined: by cables, inside breadboards, and by plugging in. */
export function buildNetlist(doc: SetupDoc, parts: PartsById, index = new SetupIndex(doc, parts)): Netlist {
  const uf = new UnionFind();
  const touched = new Map<string, ResolvedPin>();
  const dangling: Cable[] = [];

  const touch = (ref: PinRef): ResolvedPin | undefined => {
    const key = pinKey(ref);
    let r = touched.get(key);
    if (!r) {
      r = index.resolve(ref);
      if (!r) return undefined;
      touched.set(key, r);
      uf.find(key);
      // Breadboard holes join their group.
      if (r.pin.group) uf.union(key, `${ref.instanceId}/#${r.pin.group}`);
    }
    return r;
  };

  const cableEnds: Array<{ cable: Cable; key: string }> = [];
  for (const cable of doc.cables) {
    if (!index.resolve(cable.from) || !index.resolve(cable.to)) {
      dangling.push(cable);
      continue;
    }
    const a = touch(cable.from)!;
    const b = touch(cable.to)!;
    uf.union(a.key, b.key);
    cableEnds.push({ cable, key: a.key });
  }

  const snaps = findSnaps(doc, parts);
  for (const snap of snaps) {
    const a = touch(snap.pin);
    const b = touch(snap.hole);
    if (a && b) uf.union(a.key, b.key);
  }

  const byRoot = new Map<string, Net>();
  const nets: Net[] = [];
  const netOfPin = new Map<string, Net>();
  const netFor = (key: string): Net => {
    const root = uf.find(key);
    let net = byRoot.get(root);
    if (!net) {
      net = { id: nets.length, pins: [], cableIds: [] };
      byRoot.set(root, net);
      nets.push(net);
    }
    return net;
  };
  for (const [key, r] of touched) {
    const net = netFor(key);
    net.pins.push(r);
    netOfPin.set(key, net);
  }
  for (const { cable, key } of cableEnds) netFor(key).cableIds.push(cable.id);

  return { nets, snaps, dangling, netOfPin };
}
