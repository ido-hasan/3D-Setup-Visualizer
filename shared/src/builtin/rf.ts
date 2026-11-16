import type { Part, PinType } from '../types';
import { BACK, BLACK, Body, DARK, LEFT, NOTE, RIGHT } from './body';
import { BoardBuilder, GOLD, SILVER, type PinDef } from './builder';

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

// Instruments

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
