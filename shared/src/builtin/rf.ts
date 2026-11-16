import type { BoardShape, Part, Pin, PinGender, PinType, RfConnector, Vec3 } from '../types';
import { round } from '../vec';
import { BoardBuilder, GOLD, rfPortShapes, shapesBBox, SILVER, type PinDef } from './builder';

const BLACK = '#1d1d20';
const DARK = '#2a2a2e';
const NOTE = 'Simplified model drawn by the app. Sizes are approximate.';

const LEFT: Vec3 = [-1, 0, 0];
const RIGHT: Vec3 = [1, 0, 0];
const BACK: Vec3 = [0, 1, 0];

/**
 * Draws a part that has no circuit board, such as a barrel attenuator or an instrument in a case.
 * Coordinates are free while drawing. build() then puts the part on the bench with the centre
 * of its base at the origin, the way every part is stored.
 */
class Body {
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

const power = (name: string, type: PinType, limit?: 3.3 | 5): PinDef => ({ name, type, limit });

// Passive inline parts

function attenuator(): Part {
  const z = 4.7;
  return new Body()
    .cyl([0, 0, z], 9, 14, 'x', SILVER)
    .cyl([0, 0, z], 9.4, 5, 'x', DARK)
    .port('RF (plug)', [-7, 0, z], LEFT, 'male')
    .port('RF (jack)', [7, 0, z], RIGHT)
    .build({ id: 'builtin:rf-attenuator', name: 'SMA attenuator' });
}

function dcBlock(): Part {
  const z = 4.2;
  return new Body()
    .cyl([0, 0, z], 8, 9, 'x', GOLD)
    .cyl([0, 0, z], 8.4, 2.5, 'x', BLACK)
    .port('RF (plug)', [-4.5, 0, z], LEFT, 'male')
    .port('RF (jack)', [4.5, 0, z], RIGHT)
    .build({ id: 'builtin:rf-dc-block', name: 'SMA DC block' });
}

function terminator(): Part {
  const z = 4;
  return new Body()
    .cyl([3.5, 0, z], 7.4, 7, 'x', GOLD)
    .cyl([7.5, 0, z], 8, 1.4, 'x', DARK)
    .port('RF', [0, 0, z], LEFT, 'male')
    .build({ id: 'builtin:rf-terminator', name: 'SMA 50 Ω terminator' });
}

function lowPassFilter(): Part {
  const z = 5.5;
  return new Body()
    .cyl([0, 0, z], 11, 32, 'x', SILVER)
    .cyl([-9, 0, z], 11.4, 3, 'x', '#2f6fd6')
    .port('IN', [-16, 0, z], LEFT)
    .port('OUT', [16, 0, z], RIGHT)
    .build({ id: 'builtin:rf-low-pass-filter', name: 'SMA low-pass filter' });
}

function biasTee(): Part {
  return new Body()
    .box([0, 0, 5], [26, 20, 10], SILVER)
    .box([0, 0, 10.1], [20, 14, 0.2], DARK)
    .port('RF', [-13, 0, 5], LEFT)
    .port('RF+DC', [13, 0, 5], RIGHT)
    .pin('DC', 'VIN', [-3, 10, 5], BACK)
    .pin('GND', 'GND', [3, 10, 5], BACK)
    .build({ id: 'builtin:rf-bias-tee', name: 'Bias tee' });
}

function splitter(): Part {
  return new Body()
    .box([0, 0, 5], [34, 26, 10], SILVER)
    .box([0, 0, 10.1], [26, 18, 0.2], DARK)
    .port('SUM', [-17, 0, 5], LEFT)
    .port('OUT 1', [17, 8, 5], RIGHT)
    .port('OUT 2', [17, -8, 5], RIGHT)
    .build({ id: 'builtin:rf-splitter', name: '2-way power splitter' });
}

function coupler(): Part {
  return new Body()
    .box([0, 0, 5], [44, 16, 10], SILVER)
    .box([0, 0, 10.1], [36, 9, 0.2], DARK)
    .port('IN', [-22, 0, 5], LEFT)
    .port('OUT', [22, 0, 5], RIGHT)
    .port('COUPLED', [-12, 8, 5], BACK)
    .build({ id: 'builtin:rf-coupler', name: 'Directional coupler' });
}

function mixer(): Part {
  return new Body()
    .box([0, 0, 5], [22, 20, 10], SILVER)
    .box([0, 0, 10.1], [15, 13, 0.2], '#2f6fd6')
    .port('LO', [-11, 0, 5], LEFT)
    .port('RF', [11, 0, 5], RIGHT)
    .port('IF', [0, 10, 5], BACK)
    .build({ id: 'builtin:rf-mixer', name: 'Mixer' });
}

// SDRs and instruments

function rtlSdr(): Part {
  return new Body()
    .box([0, 0, 6], [66, 26, 12], '#b9bcc2')
    .box([-34, 0, 6], [2, 26, 12], DARK)
    .box([34, 0, 6], [2, 26, 12], DARK)
    .box([-42, 0, 6], [14, 12, 4.5], SILVER)
    .usb('USB plug', [-49, 0, 6], LEFT, 'male')
    .port('ANT', [35, 0, 6], RIGHT)
    .build({ id: 'builtin:rf-rtl-sdr', name: 'RTL-SDR dongle' });
}

function hackRf(): Part {
  const b = new Body()
    .box([0, 0, 8.5], [124, 78, 17], BLACK)
    .box([0, 0, 17.1], [104, 60, 0.2], DARK)
    .box([-62.5, -20, 8.5], [2, 8, 3], SILVER)
    .usb('USB', [-63.5, -20, 8.5], LEFT)
    .port('ANTENNA', [62, 22, 8.5], RIGHT)
    .port('CLKIN', [-62, 24, 8.5], LEFT)
    .port('CLKOUT', [-62, 8, 8.5], LEFT);
  // Status lights along the antenna end.
  ['#3fbf4f', '#3fbf4f', '#f2c230', '#f2c230', '#d6392c', '#d6392c'].forEach((color, i) => b.box([56, -26 + i * 5, 17.2], [2, 1.5, 0.4], color));
  return b.build({ id: 'builtin:rf-hackrf-one', name: 'HackRF One' });
}

function nanoVna(): Part {
  return new Body()
    .box([0, 0, 6], [86, 54, 12], BLACK)
    .box([8, 0, 12.2], [58, 44, 0.4], '#0e3347')
    .cyl([-30, 18, 12.6], 8, 1.2, 'z', DARK)
    .box([20, 27.5, 6], [9, 3, 3.2], SILVER)
    .usb('USB-C', [20, 29, 6], BACK)
    .port('CH0', [-43, 13, 6], LEFT)
    .port('CH1', [-43, -13, 6], LEFT)
    .build({ id: 'builtin:rf-nanovna', name: 'NanoVNA' });
}

function tinySa(): Part {
  return new Body()
    .box([0, 0, 8.5], [70, 58, 17], BLACK)
    .box([6, 0, 17.2], [50, 40, 0.4], '#102a44')
    .cyl([-27, 20, 17.6], 7, 1.2, 'z', DARK)
    .box([18, 29.5, 8.5], [9, 3, 3.2], SILVER)
    .usb('USB-C', [18, 31, 8.5], BACK)
    .port('HIGH', [-35, 14, 8.5], LEFT)
    .port('LOW', [-35, -14, 8.5], LEFT)
    .build({ id: 'builtin:rf-tinysa', name: 'tinySA spectrum analyzer' });
}

// Antennas

function whipAntenna(): Part {
  const z = 5;
  return new Body()
    .port('RF', [0, 0, z], LEFT, 'male')
    .cyl([7, 0, z], 9, 14, 'x', BLACK)
    .cyl([17, 0, z], 10, 6, 'x', DARK)
    .cyl([67.5, 0, z], 7, 95, 'x', BLACK)
    .build({ id: 'builtin:rf-whip-antenna', name: 'Whip antenna (SMA)' });
}

function gpsAntenna(): Part {
  return new Body()
    .cyl([0, 0, 6.5], 40, 13, 'z', BLACK)
    .cyl([0, 0, 13.1], 30, 0.2, 'z', DARK)
    .cyl([35, 0, 4], 3, 30, 'x', BLACK)
    .port('RF', [50, 0, 4], RIGHT, 'male')
    .build({ id: 'builtin:rf-gps-antenna', name: 'GPS puck antenna' });
}

function patchAntenna(): Part {
  const b = new BoardBuilder(38, 38, '#2e7d46');
  b.box(19, 21, 25, 25, 4, '#e8e2d0').box(19, 21, 19, 19, 0.2, SILVER, { lift: 4 });
  b.ufl('RF', 19, 4);
  return b.build({ id: 'builtin:rf-patch-antenna', name: 'Patch antenna (U.FL)', category: 'RF', logicVoltage: 5, note: NOTE });
}

// Amplifier and switch modules. The edge jacks are wider than the board is thick,
// so the board stands on them, this far above the bench.
const EDGE_JACK_LIFT = 3.2;

function lna(): Part {
  const b = new BoardBuilder(28, 24, '#1f3f95', { pcbZ: EDGE_JACK_LIFT });
  b.rfPort('RF IN', 0, 11, '-x').rfPort('RF OUT', 28, 11, '+x');
  b.box(14, 11, 12, 10, 3, SILVER);
  b.header({ name: 'PWR', at: [12.73, 21.6], dir: '+x', style: 'up', pins: [power('VCC 5V', '5V'), 'GND'] });
  return b.build({ id: 'builtin:rf-lna', name: 'LNA module', category: 'RF', logicVoltage: 5, note: NOTE });
}

function powerAmplifier(): Part {
  const b = new BoardBuilder(52, 34, '#1d2a4d', { pcbZ: EDGE_JACK_LIFT });
  b.rfPort('RF IN', 0, 15, '-x').rfPort('RF OUT', 52, 15, '+x');
  // Heat sink.
  b.box(26, 15, 30, 22, 3, DARK);
  for (let i = 0; i < 8; i++) b.box(26, 5 + i * 2.86, 30, 1.2, 8, DARK, { lift: 3 });
  b.header({ name: 'PWR', at: [24.73, 31.4], dir: '+x', style: 'up', pins: [power('VCC 12V', 'VIN'), 'GND'] });
  return b.build({ id: 'builtin:rf-power-amplifier', name: 'Power amplifier module', category: 'RF', logicVoltage: 5, note: NOTE });
}

function rfSwitch(): Part {
  const b = new BoardBuilder(32, 30, '#2e7d46', { pcbZ: EDGE_JACK_LIFT });
  b.rfPort('RFC', 0, 13, '-x').rfPort('RF1', 32, 20, '+x').rfPort('RF2', 32, 6, '+x');
  b.box(16, 13, 4, 4, 1, '#232326', { rot: 45 });
  b.header({ name: 'CTL', at: [10.92, 27.4], dir: '+x', style: 'up', pins: [power('VCC', '5V'), 'GND', power('CTRL', 'GPIO', 5)] });
  return b.build({ id: 'builtin:rf-switch', name: 'SPDT RF switch', category: 'RF', logicVoltage: 3.3, note: NOTE });
}

let cache: Part[] | undefined;

export function builtinRfParts(): Part[] {
  cache ??= [
    rtlSdr(),
    hackRf(),
    nanoVna(),
    tinySa(),
    lna(),
    powerAmplifier(),
    rfSwitch(),
    mixer(),
    attenuator(),
    terminator(),
    dcBlock(),
    lowPassFilter(),
    biasTee(),
    splitter(),
    coupler(),
    whipAntenna(),
    patchAntenna(),
    gpsAntenna(),
  ];
  return cache;
}
