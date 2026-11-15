import { describe, expect, it } from 'vitest';
import { expandStrip, makeStrip, moveStripEnd, moveStripStart, setStripCount, setStripPitch, translateStrip } from '../src/index';

describe('strips', () => {
  it('derives the pin count from the two picked points and snaps the end', () => {
    const s = makeStrip([0, 0, 5], [20.5, 0.2, 5], { id: 's', name: 'J' });
    expect(s.count).toBe(9); // 20.5 / 2.54 = 8.07 gaps -> 9 pins
    expect(s.end[0]).toBeCloseTo(8 * 2.54, 2);
    const pins = expandStrip(s);
    expect(pins).toHaveLength(9);
    expect(pins[0].id).toBe('s.0');
    expect(pins[8].position[0]).toBeCloseTo(8 * 2.54, 2);
    expect(pins.map((p) => p.name).slice(0, 2)).toEqual(['J1', 'J2']);
  });

  it('numbers two-row strips across the rows, like a Raspberry Pi header', () => {
    const s = { ...makeStrip([0, 0, 0], [2.54 * 2, 0, 0], { id: 's', name: 'P', rows: 2 }) };
    const pins = expandStrip(s);
    expect(pins).toHaveLength(6);
    expect(pins[0].position).toEqual([0, 0, 0]);
    expect(pins[1].position).toEqual([0, 2.54, 0]); // second row, same column
    expect(pins[2].position).toEqual([2.54, 0, 0]);
    const flipped = expandStrip({ ...s, flipRows: true });
    expect(flipped[1].position).toEqual([0, -2.54, 0]);
  });

  it('keeps pin ids when the strip moves, resizes or changes pitch', () => {
    let s = makeStrip([0, 0, 0], [10.16, 0, 0], { id: 's', name: 'J' });
    const before = expandStrip(s).map((p) => p.id);
    s = translateStrip(s, [5, 5, 0]);
    s = setStripPitch(s, 2);
    expect(expandStrip(s).map((p) => p.id)).toEqual(before);
    expect(expandStrip(s)[4].position).toEqual([13, 5, 0]);
    s = setStripCount(s, 3);
    expect(expandStrip(s).map((p) => p.id)).toEqual(before.slice(0, 3));
    expect(s.end).toEqual([9, 5, 0]);
  });

  it('applies per-pin overrides: rename, retype, nudge and delete', () => {
    const s = makeStrip([0, 0, 0], [5.08, 0, 0], { id: 's', name: 'J' });
    s.overrides = {
      0: { name: 'GND', type: 'GND' },
      1: { offset: [0, 1, 0], voltageLimit: 3.3 },
      2: { deleted: true },
    };
    const pins = expandStrip(s);
    expect(pins).toHaveLength(2);
    expect(pins[0]).toMatchObject({ name: 'GND', type: 'GND' });
    expect(pins[1]).toMatchObject({ position: [2.54, 1, 0], voltageLimit: 3.3, type: 'GPIO' });
  });

  it('dragging an end either adds pins or stretches the pitch', () => {
    const s = makeStrip([0, 0, 0], [5.08, 0, 0], { id: 's', name: 'J' });
    expect(moveStripEnd(s, [0, 12.7, 0], true)).toMatchObject({ count: 6, pitch: 2.54, end: [0, 12.7, 0] });
    expect(moveStripEnd(s, [9, 0, 0], false)).toMatchObject({ count: 3, pitch: 4.5 });
    const moved = moveStripStart(s, [-5.08, 0, 0], true);
    expect(moved).toMatchObject({ count: 5, start: [-5.08, 0, 0], end: [5.08, 0, 0] });
  });
});
