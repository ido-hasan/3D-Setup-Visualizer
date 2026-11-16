import type { Part, Pin, PinGender, PinType, Strip, Vec3 } from './types';
import { add, cross, dist, dot, norm, roundVec, scale, sub } from './vec';

export const DEFAULT_PITCH = 2.54;

export function stripDirection(strip: Strip): Vec3 {
  return norm(sub(strip.end, strip.start), [1, 0, 0]);
}

/** Direction from row 0 to row 1. */
export function stripRowDirection(strip: Strip): Vec3 {
  const dir = stripDirection(strip);
  const n = norm(strip.normal);
  let rowDir = cross(n, dir);
  if (Math.hypot(...rowDir) < 1e-6) {
    // The strip runs along its own normal. Pick any perpendicular.
    rowDir = cross(Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], dir);
  }
  rowDir = norm(rowDir, [0, 1, 0]);
  return strip.flipRows ? scale(rowDir, -1) : rowDir;
}

export function stripPinId(stripId: string, index: number): string {
  return `${stripId}.${index}`;
}

/** Generate the pins of a strip. Pin ids are stable: they depend only on the strip id and the index. */
export function expandStrip(strip: Strip): Pin[] {
  const dir = stripDirection(strip);
  const rowDir = stripRowDirection(strip);
  const normal = norm(strip.normal);
  const pins: Pin[] = [];
  for (let i = 0; i < strip.count; i++) {
    for (let r = 0; r < strip.rows; r++) {
      const index = i * strip.rows + r;
      const ov = strip.overrides[index];
      if (ov?.deleted) continue;
      let position = add(strip.start, add(scale(dir, strip.pitch * i), scale(rowDir, strip.rowSpacing * r)));
      if (ov?.offset) position = add(position, ov.offset);
      const pin: Pin = {
        id: stripPinId(strip.id, index),
        name: ov?.name ?? `${strip.name}${index + 1}`,
        type: ov?.type ?? strip.type,
        position: roundVec(position),
        normal,
        gender: strip.gender,
        stripId: strip.id,
        stripIndex: index,
      };
      if (ov?.voltageLimit) pin.voltageLimit = ov.voltageLimit;
      if (pin.type === 'RF') pin.connector = strip.connector ?? 'SMA';
      pins.push(pin);
    }
  }
  return pins;
}

const pinCache = new WeakMap<Part, Pin[]>();

/** Every pin of a part: single pins plus the pins of each strip. */
export function partPins(part: Part): Pin[] {
  let pins = pinCache.get(part);
  if (!pins) {
    pins = [...part.pins];
    for (const strip of part.strips) pins.push(...expandStrip(strip));
    pinCache.set(part, pins);
  }
  return pins;
}

const pinMapCache = new WeakMap<Part, Map<string, Pin>>();

export function partPinMap(part: Part): Map<string, Pin> {
  let map = pinMapCache.get(part);
  if (!map) {
    map = new Map(partPins(part).map((p) => [p.id, p]));
    pinMapCache.set(part, map);
  }
  return map;
}

export interface NewStripOptions {
  id: string;
  name: string;
  pitch?: number;
  rows?: 1 | 2;
  rowSpacing?: number;
  normal?: Vec3;
  gender?: PinGender;
  type?: PinType;
  flipRows?: boolean;
}

/**
 * Build a strip from two picked points. The pin count comes from the distance and the pitch,
 * and the end point is moved onto the last pin.
 */
export function makeStrip(start: Vec3, approxEnd: Vec3, opts: NewStripOptions): Strip {
  const pitch = opts.pitch ?? DEFAULT_PITCH;
  const strip: Strip = {
    id: opts.id,
    name: opts.name,
    start: roundVec(start),
    end: roundVec(approxEnd),
    count: 1,
    rows: opts.rows ?? 1,
    rowSpacing: opts.rowSpacing ?? pitch,
    pitch,
    flipRows: opts.flipRows,
    normal: opts.normal ?? [0, 0, 1],
    gender: opts.gender ?? 'male',
    type: opts.type ?? 'GPIO',
    overrides: {},
  };
  return moveStripEnd(strip, approxEnd, true);
}

/**
 * Move the far end of a strip.
 * keepPitch: the pitch stays and the pin count follows the new length.
 * Otherwise the count stays and the pitch stretches.
 */
export function moveStripEnd(strip: Strip, end: Vec3, keepPitch: boolean): Strip {
  const d = dist(strip.start, end);
  const dir = norm(sub(end, strip.start), stripDirection(strip));
  if (keepPitch) {
    const count = Math.max(1, Math.round(d / strip.pitch) + 1);
    return { ...strip, count, end: roundVec(add(strip.start, scale(dir, strip.pitch * Math.max(count - 1, 1)))) };
  }
  const pitch = strip.count > 1 ? d / (strip.count - 1) : strip.pitch;
  return { ...strip, pitch: Math.max(0.1, pitch), end: roundVec(end) };
}

/** Move the first pin. The far end stays where it is, so the strip changes length. */
export function moveStripStart(strip: Strip, start: Vec3, keepPitch: boolean): Strip {
  const reversed = moveStripEnd({ ...strip, start: strip.end, end: strip.start }, start, keepPitch);
  return { ...strip, count: reversed.count, pitch: reversed.pitch, start: reversed.end, end: strip.end };
}

/** Slide the whole strip. */
export function translateStrip(strip: Strip, delta: Vec3): Strip {
  return { ...strip, start: roundVec(add(strip.start, delta)), end: roundVec(add(strip.end, delta)) };
}

export function setStripCount(strip: Strip, count: number): Strip {
  const c = Math.max(1, Math.min(200, Math.round(count)));
  const dir = stripDirection(strip);
  return { ...strip, count: c, end: roundVec(add(strip.start, scale(dir, strip.pitch * Math.max(c - 1, 1)))) };
}

export function setStripPitch(strip: Strip, pitch: number): Strip {
  const p = Math.max(0.1, pitch);
  const dir = stripDirection(strip);
  return { ...strip, pitch: p, end: roundVec(add(strip.start, scale(dir, p * Math.max(strip.count - 1, 1)))) };
}

/** Project a point onto the plane through `origin` with the given normal. */
export function projectOnPlane(point: Vec3, origin: Vec3, normal: Vec3): Vec3 {
  const n = norm(normal);
  return sub(point, scale(n, dot(sub(point, origin), n)));
}
