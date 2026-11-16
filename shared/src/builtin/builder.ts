import type { BBox, BoardShape, Part, Pin, PinGender, PinType, RfConnector, Strip, StripPinOverride, Vec3 } from '../types';
import { round } from '../vec';

const P = 2.54;
export const GOLD = '#c9a13b';
export const SILVER = '#c9ccd1';
const HEADER_BLACK = '#1b1b1d';

/** The box around a list of shapes. */
export function shapesBBox(shapes: BoardShape[]): BBox {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of shapes) {
    let half: Vec3 = [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2];
    if (s.kind === 'cyl' && s.axis === 'x') half = [s.size[2] / 2, s.size[0] / 2, s.size[0] / 2];
    if (s.kind === 'cyl' && s.axis === 'y') half = [s.size[0] / 2, s.size[2] / 2, s.size[0] / 2];
    if (s.rot) {
      const r = Math.hypot(half[0], half[1]);
      half = [r, r, half[2]];
    }
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], s.pos[k] - half[k]);
      max[k] = Math.max(max[k], s.pos[k] + half[k]);
    }
  }
  return { min: min.map((v) => round(v, 2)) as Vec3, max: max.map((v) => round(v, 2)) as Vec3 };
}

const axisOf = (dir: Vec3): 'x' | 'y' | 'z' => (dir[0] !== 0 ? 'x' : dir[1] !== 0 ? 'y' : 'z');

/**
 * Shapes for a coaxial connector that sticks out of a part, and where a cable meets it.
 * `base` is the point on the part's surface and `dir` an axis direction pointing away from it.
 * A jack (female) is a threaded barrel, a plug (male) is a coupling nut.
 */
export function rfPortShapes(base: Vec3, dir: Vec3, connector: RfConnector, gender: 'male' | 'female'): { shapes: BoardShape[]; tip: Vec3 } {
  const axis = axisOf(dir);
  const along = (d: number): Vec3 => [round(base[0] + dir[0] * d), round(base[1] + dir[1] * d), round(base[2] + dir[2] * d)];
  const cyl = (from: number, length: number, diameter: number, color: string, sides?: number): BoardShape => ({
    kind: 'cyl',
    pos: along(from + length / 2),
    size: [diameter, diameter, length],
    axis,
    color,
    ...(sides ? { sides } : {}),
  });
  if (connector === 'UFL') {
    return { shapes: [cyl(0, 0.5, 2.8, '#d9d2c0'), cyl(0.5, 0.8, 2, GOLD)], tip: along(1.3) };
  }
  if (connector === 'MMPX') {
    // A small snap-on connector: no thread and no nut.
    if (gender === 'male') return { shapes: [cyl(0, 6, 3.8, GOLD)], tip: along(6) };
    return { shapes: [cyl(0, 0.8, 4.4, GOLD), cyl(0.8, 3, 3.2, GOLD)], tip: along(3.8) };
  }
  if (connector === 'SMA') {
    if (gender === 'male') return { shapes: [cyl(0, 8, 8, GOLD, 6)], tip: along(8) };
    return { shapes: [cyl(0, 1.8, 8, GOLD, 6), cyl(1.8, 6.6, 6.2, GOLD)], tip: along(8.4) };
  }
  if (connector === 'BNC') {
    if (gender === 'male') return { shapes: [cyl(0, 13, 14.5, SILVER)], tip: along(13) };
    return { shapes: [cyl(0, 2, 12.6, SILVER, 6), cyl(2, 9.5, 9.6, SILVER)], tip: along(11.5) };
  }
  if (gender === 'male') return { shapes: [cyl(0, 15, 20, SILVER, 6)], tip: along(15) };
  return { shapes: [cyl(0, 2.5, 19, SILVER, 6), cyl(2.5, 11, 15.8, SILVER)], tip: along(13.5) };
}

export type PinDef = string | { name: string; type?: PinType; limit?: 3.3 | 5 };

type Dir = '+x' | '-x' | '+y' | '-y';
const DIRS: Record<Dir, [number, number]> = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };

/** Guess the electrical type from a pin's printed name. */
export function typeFromName(name: string): PinType {
  const n = name.toUpperCase();
  if (/^(GND|G)$/.test(n) || n.startsWith('GND')) return 'GND';
  if (/^(5V|\+5V|VBUS|VCC \(5V\))$/.test(n)) return '5V';
  if (/^(3V3|3\.3V|3\.3|3V|VDD)$/.test(n)) return '3V3';
  if (n === 'VIN') return 'VIN';
  if (/\bSDA\b/.test(n)) return 'I2C_SDA';
  if (/\bSCL\b/.test(n)) return 'I2C_SCL';
  if (/\b(TX|TXD|TX\d)\b/.test(n)) return 'UART_TX';
  if (/\b(RX|RXD|RX\d)\b/.test(n)) return 'UART_RX';
  if (/^A\d+$/.test(n)) return 'ANALOG';
  if (/^(NC|RESET|RST|NRST|AREF|IOREF|BOOT0|VBAT|DTR|CTS)/.test(n)) return 'OTHER';
  return 'GPIO';
}

export interface HeaderOptions {
  /** Strip name, also used as the id. */
  name: string;
  /** First pin, in board coordinates (origin at the PCB's lower-left corner). */
  at: [number, number];
  dir: Dir;
  rows?: 1 | 2;
  /** Pins in index order: along the strip, and across the rows for two-row headers. */
  pins: PinDef[];
  /**
   * up: male pins standing on the board.
   * socket: female header.
   * down: male pins through the board, for plugging into a breadboard.
   * side: right-angle male pins pointing out along `out`.
   */
  style: 'up' | 'socket' | 'down' | 'side';
  out?: Dir;
  flipRows?: boolean;
}

/**
 * Draws a simple board from boxes and cylinders and collects its pins.
 * Coordinates are given the way datasheets give them, from the lower-left corner of the PCB,
 * and are re-centred on the PCB when the part is built.
 */
export class BoardBuilder {
  shapes: BoardShape[] = [];
  strips: Strip[] = [];
  pins: Pin[] = [];
  readonly thickness = 1.6;
  /** Height of the PCB's underside above the bench. */
  readonly pcbZ: number;

  constructor(
    readonly width: number,
    readonly depth: number,
    pcbColor: string,
    opts: { pcbZ?: number } = {},
  ) {
    this.pcbZ = opts.pcbZ ?? 0;
    this.shapes.push({
      kind: 'box',
      pos: [0, 0, this.pcbZ + this.thickness / 2],
      size: [width, depth, this.thickness],
      color: pcbColor,
    });
  }

  get top(): number {
    return this.pcbZ + this.thickness;
  }

  private cx(x: number): number {
    return round(x - this.width / 2);
  }
  private cy(y: number): number {
    return round(y - this.depth / 2);
  }

  /** A box sitting on the PCB. x, y are its centre; lift raises it above the PCB surface. */
  box(x: number, y: number, sx: number, sy: number, sz: number, color: string, opts: { lift?: number; rot?: number } = {}): this {
    this.shapes.push({
      kind: 'box',
      pos: [this.cx(x), this.cy(y), round(this.top + (opts.lift ?? 0) + sz / 2)],
      size: [sx, sy, sz],
      color,
      rot: opts.rot,
    });
    return this;
  }

  /** An upright cylinder sitting on the PCB. */
  cyl(x: number, y: number, diameter: number, height: number, color: string, opts: { lift?: number; axis?: 'x' | 'y' | 'z' } = {}): this {
    this.shapes.push({
      kind: 'cyl',
      pos: [this.cx(x), this.cy(y), round(this.top + (opts.lift ?? 0) + height / 2)],
      size: [diameter, diameter, height],
      axis: opts.axis ?? 'z',
      color,
    });
    return this;
  }

  /** A mounting hole, drawn as a dark disc. */
  hole(x: number, y: number, diameter = 3.2): this {
    return this.cyl(x, y, diameter, 0.1, '#20201f');
  }

  /** A connector that takes a USB cable. */
  usb(name: string, x: number, y: number, z: number, out: Dir, gender: PinGender = 'female'): this {
    const [ox, oy] = DIRS[out];
    this.pins.push({
      id: `usb-${this.pins.length}`,
      name,
      type: 'USB',
      position: [this.cx(x), this.cy(y), round(this.top + z)],
      normal: [ox, oy, 0],
      gender,
    });
    return this;
  }

  /**
   * An edge-mounted coax jack. (x, y) is the point on the PCB edge and `out` points off the board.
   * The connector body straddles the board edge, as edge-launch SMA jacks do.
   */
  rfPort(name: string, x: number, y: number, out: Dir, connector: RfConnector = 'SMA'): this {
    const [ox, oy] = DIRS[out];
    const z = round(this.pcbZ + this.thickness / 2);
    const body = 6.4;
    const depth = 5;
    this.shapes.push({
      kind: 'box',
      pos: [this.cx(x) - (ox * depth) / 2, this.cy(y) - (oy * depth) / 2, z],
      size: [Math.abs(ox) * depth + Math.abs(oy) * body, Math.abs(oy) * depth + Math.abs(ox) * body, body],
      color: GOLD,
    });
    const port = rfPortShapes([this.cx(x), this.cy(y), z], [ox, oy, 0], connector, 'female');
    this.shapes.push(...port.shapes);
    this.pins.push({ id: `rf-${this.pins.length}`, name, type: 'RF', connector, position: port.tip, normal: [ox, oy, 0], gender: 'female' });
    return this;
  }

  /** A U.FL jack soldered on top of the board. */
  ufl(name: string, x: number, y: number): this {
    const port = rfPortShapes([this.cx(x), this.cy(y), this.top], [0, 0, 1], 'UFL', 'female');
    this.shapes.push(...port.shapes);
    this.pins.push({ id: `rf-${this.pins.length}`, name, type: 'RF', connector: 'UFL', position: port.tip, normal: [0, 0, 1], gender: 'female' });
    return this;
  }

  header(o: HeaderOptions): this {
    const rows = o.rows ?? 1;
    const count = Math.ceil(o.pins.length / rows);
    const [dx, dy] = DIRS[o.dir];
    // Row direction is normal x direction, with normal = +Z (matches expandStrip).
    let rx = -dy;
    let ry = dx;
    if (o.flipRows) {
      rx = -rx;
      ry = -ry;
    }
    const top = this.top;
    let normal: Vec3 = [0, 0, 1];
    let pinZ: number;
    let gender: PinGender = 'male';

    const x0 = this.cx(o.at[0]);
    const y0 = this.cy(o.at[1]);
    const lenAlong = count * P;
    const lenAcross = rows * P;
    // Centre of the header block.
    const mx = x0 + (dx * (count - 1) * P) / 2 + (rx * (rows - 1) * P) / 2;
    const my = y0 + (dy * (count - 1) * P) / 2 + (ry * (rows - 1) * P) / 2;
    const sizeX = Math.abs(dx) * lenAlong + Math.abs(rx) * lenAcross;
    const sizeY = Math.abs(dy) * lenAlong + Math.abs(ry) * lenAcross;

    const eachPin = (fn: (x: number, y: number) => void) => {
      for (let i = 0; i < count; i++)
        for (let r = 0; r < rows; r++) {
          if (i * rows + r >= o.pins.length) continue;
          fn(x0 + dx * i * P + rx * r * P, y0 + dy * i * P + ry * r * P);
        }
    };

    if (o.style === 'socket') {
      gender = 'female';
      pinZ = top + 8.5;
      this.shapes.push({ kind: 'box', pos: [mx, my, top + 4.25], size: [sizeX, sizeY, 8.5], color: HEADER_BLACK });
      eachPin((x, y) => this.shapes.push({ kind: 'box', pos: [x, y, top + 8.5], size: [1, 1, 0.1], color: '#6d5a25' }));
    } else if (o.style === 'up') {
      pinZ = top + 2.5;
      this.shapes.push({ kind: 'box', pos: [mx, my, top + 1.25], size: [sizeX, sizeY, 2.5], color: HEADER_BLACK });
      eachPin((x, y) => this.shapes.push({ kind: 'box', pos: [x, y, top + 2.5 + 3], size: [0.64, 0.64, 6], color: GOLD }));
    } else if (o.style === 'down') {
      pinZ = top;
      const under = this.pcbZ;
      this.shapes.push({ kind: 'box', pos: [mx, my, under - 1.25], size: [sizeX, sizeY, 2.5], color: HEADER_BLACK });
      eachPin((x, y) => {
        this.shapes.push({ kind: 'box', pos: [x, y, (under - 2.5) / 2], size: [0.64, 0.64, under - 2.5], color: GOLD });
        this.shapes.push({ kind: 'cyl', pos: [x, y, top + 0.2], size: [1.5, 1.5, 0.4], color: '#c8c8c8' });
      });
    } else {
      const [ox, oy] = DIRS[o.out ?? '+x'];
      normal = [ox, oy, 0];
      pinZ = top + 1.27;
      // Block sits on the board edge. Pins stick out sideways.
      this.shapes.push({ kind: 'box', pos: [mx, my, top + 1.27], size: [sizeX, sizeY, 2.54], color: HEADER_BLACK });
      eachPin((x, y) =>
        this.shapes.push({
          kind: 'box',
          pos: [x + ox * (1.27 + 3), y + oy * (1.27 + 3), top + 1.27],
          size: [Math.abs(ox) * 6 + Math.abs(oy) * 0.64, Math.abs(oy) * 6 + Math.abs(ox) * 0.64, 0.64],
          color: GOLD,
        }),
      );
    }

    const overrides: Record<string, StripPinOverride> = {};
    o.pins.forEach((def, i) => {
      const d = typeof def === 'string' ? { name: def } : def;
      const ov: StripPinOverride = { name: d.name, type: d.type ?? typeFromName(d.name) };
      if (d.limit) ov.voltageLimit = d.limit;
      if (o.style === 'side') {
        const [ox, oy] = DIRS[o.out ?? '+x'];
        ov.offset = [ox * 1.27, oy * 1.27, 0];
      }
      overrides[i] = ov;
    });
    // A two-row header with an odd number of pins: hide the unused last slot.
    for (let i = o.pins.length; i < count * rows; i++) overrides[i] = { deleted: true };

    this.strips.push({
      id: o.name,
      name: o.name,
      start: [x0, y0, round(pinZ)],
      end: [round(x0 + dx * Math.max(count - 1, 1) * P), round(y0 + dy * Math.max(count - 1, 1) * P), round(pinZ)],
      count,
      rows,
      rowSpacing: P,
      pitch: P,
      flipRows: o.flipRows,
      normal,
      gender,
      type: 'GPIO',
      overrides,
    });
    return this;
  }

  bbox(): BBox {
    return shapesBBox(this.shapes);
  }

  build(meta: Pick<Part, 'id' | 'name' | 'category' | 'logicVoltage'> & Partial<Part>): Part {
    return {
      model: { kind: 'board', spec: { shapes: this.shapes } },
      builtin: true,
      bbox: this.bbox(),
      pins: this.pins,
      strips: this.strips,
      ...meta,
    };
  }
}
