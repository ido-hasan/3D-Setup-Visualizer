import type { BoardShape, Part, Pin, PinGender, PinType, RfConnector, Vec3 } from '../types';
import { round } from '../vec';
import { GOLD, rfPortShapes, shapesBBox } from './builder';

export const BLACK = '#1d1d20';
export const DARK = '#2a2a2e';
export const NOTE = 'Simplified model drawn by the app. Sizes are approximate.';

export const LEFT: Vec3 = [-1, 0, 0];
export const RIGHT: Vec3 = [1, 0, 0];
export const BACK: Vec3 = [0, 1, 0];
export const FRONT: Vec3 = [0, -1, 0];

/**
 * Draws a part that has no circuit board, such as a barrel attenuator or an instrument in a case.
 * Coordinates are free while drawing. build() then puts the part on the bench with the centre
 * of its base at the origin, the way every part is stored.
 */
export class Body {
  shapes: BoardShape[] = [];
  pins: Pin[] = [];

  box(pos: Vec3, size: Vec3, color: string): this {
    this.shapes.push({ kind: 'box', pos, size, color });
    return this;
  }

  cyl(pos: Vec3, diameter: number, length: number, axis: 'x' | 'y' | 'z', color: string, sides?: number): this {
    this.shapes.push({ kind: 'cyl', pos, size: [diameter, diameter, length], axis, color, ...(sides ? { sides } : {}) });
    return this;
  }

  /** A coax connector on the surface at `base`, pointing along `dir`. */
  port(name: string, base: Vec3, dir: Vec3, gender: 'male' | 'female' = 'female', connector: RfConnector = 'SMA'): this {
    const { shapes, tip } = rfPortShapes(base, dir, connector, gender);
    this.shapes.push(...shapes);
    this.pins.push({ id: `p${this.pins.length}`, name, type: 'RF', connector, position: tip, normal: dir, gender });
    return this;
  }

  /** A solder pin for a jumper wire, standing out of the surface. */
  pin(name: string, type: PinType, base: Vec3, dir: Vec3): this {
    const axis = dir[0] !== 0 ? 'x' : dir[1] !== 0 ? 'y' : 'z';
    this.cyl([base[0] + dir[0] * 3, base[1] + dir[1] * 3, base[2] + dir[2] * 3], 1.2, 6, axis, GOLD);
    this.pins.push({ id: `p${this.pins.length}`, name, type, position: base, normal: dir, gender: 'male' });
    return this;
  }

  usb(name: string, position: Vec3, dir: Vec3, gender: PinGender = 'female'): this {
    this.pins.push({ id: `p${this.pins.length}`, name, type: 'USB', position, normal: dir, gender });
    return this;
  }

  build(meta: Pick<Part, 'id' | 'name'> & Partial<Part>): Part {
    const raw = shapesBBox(this.shapes);
    const shift: Vec3 = [-(raw.min[0] + raw.max[0]) / 2, -(raw.min[1] + raw.max[1]) / 2, -raw.min[2]];
    const move = (p: Vec3): Vec3 => [round(p[0] + shift[0]), round(p[1] + shift[1]), round(p[2] + shift[2])];
    const shapes = this.shapes.map((s) => ({ ...s, pos: move(s.pos) }));
    return {
      category: 'RF',
      logicVoltage: 5,
      model: { kind: 'board', spec: { shapes } },
      builtin: true,
      bbox: shapesBBox(shapes),
      pins: this.pins.map((p) => ({ ...p, position: move(p.position) })),
      strips: [],
      note: NOTE,
      ...meta,
    };
  }
}
