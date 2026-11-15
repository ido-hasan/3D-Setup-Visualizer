import { describe, expect, it } from 'vitest';
import { builtinParts, makeBreadboard, partPins } from '../src/index';
import { NANO, PI, PILL, UNO, parts, pinId } from './helpers';

const byName = (partId: string, name: string) => partPins(parts[partId]).find((p) => p.name === name)!;

describe('breadboards', () => {
  it('has the right number of holes', () => {
    expect(makeBreadboard('full').pins).toHaveLength(830);
    expect(makeBreadboard('half').pins).toHaveLength(400);
    expect(makeBreadboard('mini').pins).toHaveLength(170);
  });

  it('joins a-e and f-j in each column and each rail along its length', () => {
    const bb = makeBreadboard('half');
    const group = (id: string) => bb.pins.find((p) => p.id === id)!.group;
    expect(group('a1')).toBe(group('e1'));
    expect(group('f1')).toBe(group('j1'));
    expect(group('e1')).not.toBe(group('f1'));
    expect(group('a1')).not.toBe(group('a2'));
    expect(group('T+1')).toBe(group('T+25'));
    expect(group('T+1')).not.toBe(group('T-1'));
    expect(group('T+1')).not.toBe(group('B+1'));
  });

  it('keeps every hole inside the body and on a 2.54 mm pitch', () => {
    for (const size of ['full', 'half', 'mini'] as const) {
      const bb = makeBreadboard(size);
      for (const p of bb.pins) {
        expect(Math.abs(p.position[0])).toBeLessThan(bb.bbox.max[0] - 1);
        expect(Math.abs(p.position[1])).toBeLessThan(bb.bbox.max[1] - 1);
      }
      const a1 = bb.pins.find((p) => p.id === 'a1')!;
      const a2 = bb.pins.find((p) => p.id === 'a2')!;
      expect(a2.position[0] - a1.position[0]).toBeCloseTo(2.54, 5);
    }
  });
});

describe('bundled boards', () => {
  it('ships every board in the plan with unique ids', () => {
    const ids = builtinParts().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      'builtin:arduino-uno',
      'builtin:arduino-nano',
      'builtin:arduino-mega',
      'builtin:raspberry-pi-4b',
      'builtin:stm32-blue-pill',
      'builtin:stm32f4-discovery',
      'builtin:ftdi-ft232rl',
      'builtin:ch340g',
    ])
      expect(ids).toContain(id);
  });

  it('gives every pin a unique id, a position inside the bounding box, and a unit normal', () => {
    for (const part of builtinParts()) {
      const pins = partPins(part);
      expect(new Set(pins.map((p) => p.id)).size).toBe(pins.length);
      for (const p of pins) {
        for (let k = 0; k < 3; k++) {
          expect(p.position[k]).toBeGreaterThanOrEqual(part.bbox.min[k] - 0.01);
          expect(p.position[k]).toBeLessThanOrEqual(part.bbox.max[k] + 0.01);
        }
        expect(Math.hypot(...p.normal)).toBeCloseTo(1, 6);
      }
    }
  });

  it('has the expected pin counts', () => {
    const count = (id: string) => partPins(parts[id]).length;
    expect(count(UNO)).toBe(10 + 8 + 8 + 6 + 6 + 1); // headers, ICSP, USB
    expect(count(NANO)).toBe(30 + 1);
    expect(count('builtin:arduino-mega')).toBe(10 + 8 + 8 + 8 + 8 + 8 + 36 + 6 + 1);
    expect(count(PI)).toBe(40 + 5);
    expect(count(PILL)).toBe(40 + 1);
    expect(count('builtin:stm32f4-discovery')).toBe(100 + 2);
    expect(count('builtin:ftdi-ft232rl')).toBe(6 + 1);
    expect(count('builtin:ch340g')).toBe(6 + 1);
  });

  it('places the Uno headers where the board drawing puts them', () => {
    // Inches from the lower-left corner; the part is centred on the PCB.
    const at = (name: string) => {
      const p = byName(UNO, name);
      return [(p.position[0] + 34.29) / 25.4, (p.position[1] + 26.67) / 25.4];
    };
    expect(at('D0/RX')[0]).toBeCloseTo(2.5, 3);
    expect(at('D7')[0]).toBeCloseTo(1.8, 3);
    expect(at('D8')[0]).toBeCloseTo(1.64, 3); // the famous 0.16" gap
    expect(at('SCL')[0]).toBeCloseTo(0.74, 3);
    expect(at('VIN')[0]).toBeCloseTo(1.8, 3);
    expect(at('A0')[0]).toBeCloseTo(2.0, 3);
    expect(at('A5/SCL')).toEqual([expect.closeTo(2.5, 3), expect.closeTo(0.1, 3)]);
    expect(at('D13')[1]).toBeCloseTo(2.0, 3);
  });

  it('lays out the Raspberry Pi header with odd pins on the inner row', () => {
    const p1 = byName(PI, '3V3 (pin 1)');
    const p2 = byName(PI, '5V (pin 2)');
    const p40 = byName(PI, 'GPIO21 (pin 40)');
    expect(p2.position[1] - p1.position[1]).toBeCloseTo(2.54, 5);
    expect(p40.position[0] - p1.position[0]).toBeCloseTo(19 * 2.54, 3);
    expect(byName(PI, 'GND (pin 6)').type).toBe('GND');
    expect(byName(PI, 'GPIO14 TXD (pin 8)').type).toBe('UART_TX');
    expect(byName(PI, 'GPIO17 (pin 11)').voltageLimit).toBe(3.3);
  });

  it('gives the Nano and the Blue Pill 0.6 inch row spacing so they fit a breadboard', () => {
    for (const [id, a, b] of [
      [NANO, 'D12', 'D13'],
      [PILL, 'PB12', 'GND'],
    ] as const) {
      const top = partPins(parts[id]).find((p) => p.id === pinId(parts[id], a))!;
      const bottom = partPins(parts[id]).find((p) => p.id === pinId(parts[id], b))!;
      expect(Math.abs(top.position[1] - bottom.position[1])).toBeCloseTo(15.24, 3);
      expect(parts[id].plugsIntoBreadboard).toBe(true);
    }
  });
});
