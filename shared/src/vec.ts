import type { Vec3 } from './types';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

export function norm(a: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
  const l = len(a);
  return l < 1e-9 ? fallback : scale(a, 1 / l);
}

/** Rotate about Z. Exact for multiples of 90°. */
export function rotZ(v: Vec3, deg: number): Vec3 {
  const d = ((deg % 360) + 360) % 360;
  let c: number;
  let s: number;
  if (d === 0) [c, s] = [1, 0];
  else if (d === 90) [c, s] = [0, 1];
  else if (d === 180) [c, s] = [-1, 0];
  else if (d === 270) [c, s] = [0, -1];
  else {
    const r = (d * Math.PI) / 180;
    c = Math.cos(r);
    s = Math.sin(r);
  }
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

/** Snap a direction to the nearest axis. */
export function snapToAxis(v: Vec3): Vec3 {
  const ax = Math.abs(v[0]);
  const ay = Math.abs(v[1]);
  const az = Math.abs(v[2]);
  if (ax >= ay && ax >= az) return [Math.sign(v[0]) || 1, 0, 0];
  if (ay >= ax && ay >= az) return [0, Math.sign(v[1]) || 1, 0];
  return [0, 0, Math.sign(v[2]) || 1];
}

export const round = (n: number, digits = 3): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
export const roundVec = (v: Vec3, digits = 3): Vec3 => [round(v[0], digits), round(v[1], digits), round(v[2], digits)];
