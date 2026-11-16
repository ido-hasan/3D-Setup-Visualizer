import { describe, expect, it } from 'vitest';
import { analyse, buildNetlist, findSnaps, partPins, snapToBreadboard, toLocal, toWorld } from '../src/index';
import { BB, NANO, PI, PILL, UNO, cable, doc, inst, parts, pinId } from './helpers';

describe('placing parts', () => {
  it('rotates pins with their board', () => {
    const i = inst('u', UNO, 100, 50, 90, 2);
    expect(toWorld(i, [10, 0, 1])).toEqual([100, 60, 3]);
    expect(toLocal(i, toWorld(i, [10, 3, 1]))).toEqual([10, 3, 1]);
  });
});

describe('breadboard nets', () => {
  it('connects two cables that land in the same column', () => {
    const d = doc(
      [inst('u', UNO), inst('p', PI, 150), inst('bb', BB, 0, 100)],
      [cable('u', UNO, 'D2', 'bb', BB, 'a5'), cable('p', PI, 'GPIO17 (pin 11)', 'bb', BB, 'e5')],
    );
    const { netOfPin } = buildNetlist(d, parts);
    const uno = netOfPin.get(`u/${pinId(parts[UNO], 'D2')}`)!;
    const pi = netOfPin.get(`p/${pinId(parts[PI], 'GPIO17 (pin 11)')}`)!;
    expect(uno).toBe(pi);
    expect(uno.cableIds).toHaveLength(2);
  });

  it('keeps the two halves of a column and neighbouring columns apart', () => {
    const d = doc(
      [inst('u', UNO), inst('bb', BB, 0, 100)],
      [cable('u', UNO, 'D2', 'bb', BB, 'e5'), cable('u', UNO, 'D3', 'bb', BB, 'f5'), cable('u', UNO, 'D4', 'bb', BB, 'e6')],
    );
    expect(buildNetlist(d, parts).nets).toHaveLength(3);
  });

  it('joins everything on a power rail', () => {
    const d = doc(
      [inst('u', UNO), inst('p', PI, 150), inst('bb', BB, 0, 100)],
      [cable('u', UNO, 'GND', 'bb', BB, 'T-1'), cable('p', PI, 'GND (pin 6)', 'bb', BB, 'T-25')],
    );
    expect(buildNetlist(d, parts).nets).toHaveLength(1);
  });
});

describe('plugging into a breadboard', () => {
  // Nano rows are 15.24 mm apart: they land on rows c and h, which straddle the channel.
  const bbInst = inst('bb', BB, 0, 0);

  it('snaps a dragged Nano onto the holes and sinks its pins in', () => {
    const d = doc([bbInst, inst('n', NANO, 0.9, 1.6)]);
    const snap = snapToBreadboard(d.instances[1], d, parts)!;
    expect(snap).toBeDefined();
    expect(snap.breadboardId).toBe('bb');
    expect(snap.z).toBeCloseTo(8.5 - 6, 5);
    const moved = { ...d.instances[1], ...snap };
    const snaps = findSnaps(doc([bbInst, moved]), parts);
    expect(snaps).toHaveLength(30);
  });

  it('does not snap when the board is far from any breadboard', () => {
    const d = doc([bbInst, inst('n', NANO, 200, 200)]);
    expect(snapToBreadboard(d.instances[1], d, parts)).toBeUndefined();
    expect(findSnaps(d, parts)).toHaveLength(0);
  });

  it('never plugs in a board that is not breadboard-friendly', () => {
    const d = doc([bbInst, inst('p', PI, 0, 0)]);
    expect(findSnaps(d, parts)).toHaveLength(0);
  });

  it('connects a plugged-in pin to a jumper in the same column, with no cable between them', () => {
    const nano = inst('n', NANO, 0.9, 1.6);
    const start = doc([bbInst, nano]);
    Object.assign(nano, snapToBreadboard(nano, start, parts));
    // Find the hole under the Nano's D2 pin, then put a jumper in the same column.
    const d2 = partPins(parts[NANO]).find((p) => p.name === 'D2')!;
    const snaps = findSnaps(start, parts);
    const hole = snaps.find((s) => s.pin.pinId === d2.id)!.hole.pinId;
    const column = hole.slice(1);
    const neighbour = `${hole[0] === 'c' ? 'a' : 'j'}${column}`;
    const d = doc([bbInst, nano, inst('u', UNO, 0, 120)], [cable('u', UNO, 'D7', 'bb', BB, neighbour)]);
    const { netOfPin } = buildNetlist(d, parts);
    expect(netOfPin.get(`n/${d2.id}`)).toBe(netOfPin.get(`u/${pinId(parts[UNO], 'D7')}`));
  });

  it('works with the breadboard turned 90 degrees', () => {
    const turned = inst('bb', BB, 30, 40, 90);
    const pill = inst('s', PILL, 31, 41.2, 90);
    const d = doc([turned, pill]);
    const snap = snapToBreadboard(pill, d, parts)!;
    expect(snap).toBeDefined();
    expect(findSnaps(doc([turned, { ...pill, ...snap }]), parts)).toHaveLength(40);
  });
});

describe('dangling cables', () => {
  it('reports a cable whose pin or part is gone, and leaves it out of the nets', () => {
    const good = cable('u', UNO, 'D2', 'p', PI, 'GPIO17 (pin 11)');
    const lostPin = { ...cable('u', UNO, 'D3', 'p', PI, 'GPIO27 (pin 13)'), to: { instanceId: 'p', pinId: 'gone' } };
    const lostPart = { ...cable('u', UNO, 'D4', 'p', PI, 'GPIO22 (pin 15)'), to: { instanceId: 'nobody', pinId: 'x' } };
    const result = analyse(doc([inst('u', UNO), inst('p', PI, 150)], [good, lostPin, lostPart]), parts);
    expect(result.netlist.dangling.map((c) => c.id)).toEqual([lostPin.id, lostPart.id]);
    expect(result.issues.filter((i) => i.rule === 'dangling-cable')).toHaveLength(2);
    expect(result.netlist.nets).toHaveLength(1); // only the good cable makes a net
  });
});
