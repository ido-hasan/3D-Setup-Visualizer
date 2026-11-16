import { describe, expect, it } from 'vitest';
import {
  analyse,
  billOfMaterials,
  builtinParts,
  CABLE_COLORS,
  cableDescription,
  cableGeometry,
  cableTypeLabel,
  coaxEnd,
  parsePinCsv,
  partPins,
  rfPortShapes,
  type Cable,
  type Pin,
  type PinRef,
} from '../src/index';
import { doc, inst, parts } from './helpers';

const B200 = 'builtin:sdr-usrp-b200';
const B205 = 'builtin:sdr-usrp-b205mini';
const N210 = 'builtin:sdr-usrp-n210';
const X310 = 'builtin:sdr-usrp-x310';
const X410 = 'builtin:sdr-usrp-x410';
const X440 = 'builtin:sdr-usrp-x440';

const rfPorts = (id: string): Pin[] => partPins(parts[id]).filter((p) => p.type === 'RF');
const names = (id: string): string[] => rfPorts(id).map((p) => p.name);
const port = (id: string, name: string): Pin => partPins(parts[id]).find((p) => p.name === name)!;
const ref = (instanceId: string, partId: string, name: string): PinRef => ({ instanceId, pinId: port(partId, name).id });
let n = 0;
const coax = (from: PinRef, to: PinRef): Cable => ({ id: `s${++n}`, from, to, color: CABLE_COLORS.coax, autoColor: true, label: '', controlPoints: [] });

describe('the SDR group', () => {
  const sdrs = builtinParts().filter((p) => p.category === 'SDR');

  it('holds the two earlier SDRs and the six USRPs', () => {
    expect(sdrs.map((p) => p.name)).toEqual([
      'RTL-SDR dongle',
      'HackRF One',
      'USRP B200',
      'USRP B205mini-i',
      'USRP N210',
      'USRP X310',
      'USRP X410',
      'USRP X440',
    ]);
  });

  it('keeps the ids of the parts that moved out of the RF group, so saved setups still find them', () => {
    expect(parts['builtin:rf-rtl-sdr'].category).toBe('SDR');
    expect(parts['builtin:rf-hackrf-one'].category).toBe('SDR');
    expect(port('builtin:rf-hackrf-one', 'ANTENNA').id).toBe('p1');
  });

  it('rests every SDR on the bench, centred on its base, and never asks it for power', () => {
    for (const part of sdrs) {
      expect(part.bbox.min[2], part.name).toBe(0);
      expect(part.bbox.min[0] + part.bbox.max[0], part.name).toBeCloseTo(0, 2);
      expect(part.bbox.min[1] + part.bbox.max[1], part.name).toBeCloseTo(0, 2);
      const types = partPins(part).map((p) => p.type);
      expect(types.every((t) => t === 'RF' || t === 'USB'), part.name).toBe(true);
    }
  });
});

describe('USRP ports', () => {
  it('B200: one RF pair on the front, timing inputs and USB on the rear', () => {
    expect(names(B200)).toEqual(['TX/RX', 'RX2', 'GPS', 'PPS', 'REF 10 MHz']);
    expect(port(B200, 'TX/RX').normal).toEqual([0, -1, 0]);
    expect(port(B200, 'REF 10 MHz').normal).toEqual([0, 1, 0]);
    expect(port(B200, 'USB 3.0')).toMatchObject({ type: 'USB', normal: [0, 1, 0] });
  });

  it('B205mini-i: TRX, RX2 and one reference input, with USB', () => {
    expect(names(B205)).toEqual(['TRX', 'RX2', 'REF']);
    expect(port(B205, 'USB 3.0').type).toBe('USB');
    const size = parts[B205].bbox;
    expect(size.max[2]).toBeLessThan(20); // a small flat unit
  });

  it('N210: two RF ports, reference and PPS, and no USB', () => {
    expect(names(N210)).toEqual(['RF1', 'RF2', 'REF CLOCK', 'PPS IN']);
    expect(partPins(parts[N210]).some((p) => p.type === 'USB')).toBe(false);
    expect(parts[N210].note).toContain('network ports are drawn but cannot be wired');
  });

  it('X310: four RF ports on the front, five timing ports on the rear', () => {
    const front = rfPorts(X310).filter((p) => p.normal[1] === -1).map((p) => p.name);
    const rear = rfPorts(X310).filter((p) => p.normal[1] === 1).map((p) => p.name);
    expect(front).toEqual(['RF A TX/RX', 'RF A RX2', 'RF B TX/RX', 'RF B RX2']);
    expect(rear).toEqual(['REF OUT', 'REF IN', 'PPS OUT', 'PPS IN', 'GPS ANT']);
    expect(port(X310, 'JTAG USB').type).toBe('USB');
    const b = parts[X310].bbox;
    expect(b.max[0] - b.min[0]).toBeCloseTo(218, 0);
    expect(b.max[2]).toBeCloseTo(39, 0);
  });

  it('X410: eight SMA ports on the front, named by daughterboard and channel', () => {
    const front = rfPorts(X410).filter((p) => p.normal[1] === -1);
    expect(front.map((p) => p.name)).toEqual([
      'DB0 RF0 TX/RX 0', 'DB0 RF0 RX 1', 'DB0 RF1 TX/RX 0', 'DB0 RF1 RX 1',
      'DB1 RF0 TX/RX 0', 'DB1 RF0 RX 1', 'DB1 RF1 TX/RX 0', 'DB1 RF1 RX 1',
    ]);
    expect(front.every((p) => p.connector === 'SMA' && p.gender === 'female')).toBe(true);
    expect(rfPorts(X410).filter((p) => p.normal[1] === 1).map((p) => p.name)).toEqual(['TRIG IN/OUT', 'PPS IN', 'REF IN', 'GPS ANT']);
    // Daughterboard 0 is on the left, and its ports do not overlap: at least 15 mm apart.
    const xs = front.map((p) => p.position[0]);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(15);
  });

  it('X440: sixteen MMPX ports on the front, four SMA timing ports on the rear', () => {
    const mmpx = rfPorts(X440).filter((p) => p.connector === 'MMPX');
    const sma = rfPorts(X440).filter((p) => p.connector === 'SMA');
    expect(mmpx).toHaveLength(16);
    expect(sma.map((p) => p.name)).toEqual(['TRIG IN/OUT', 'PPS IN', 'REF IN', 'GPS ANT']);
    expect(mmpx.slice(0, 8).map((p) => p.name)).toEqual(['DB0 TX 0', 'DB0 TX 1', 'DB0 TX 2', 'DB0 TX 3', 'DB0 RX 0', 'DB0 RX 1', 'DB0 RX 2', 'DB0 RX 3']);
    expect(mmpx[15].name).toBe('DB1 RX 3');
    expect(mmpx.every((p) => p.normal[1] === -1)).toBe(true);
    // Transmit ports sit above the receive ports of the same number.
    const tx0 = port(X440, 'DB0 TX 0');
    const rx0 = port(X440, 'DB0 RX 0');
    expect(tx0.position[0]).toBe(rx0.position[0]);
    expect(tx0.position[2]).toBeGreaterThan(rx0.position[2]);
    // The X410 and X440 share a case: same width and height. The X440 is a little shorter
    // front to back, because its MMPX jacks stick out less than SMA jacks.
    const a = parts[X440].bbox;
    const b = parts[X410].bbox;
    expect([a.min[0], a.max[0], a.max[2]]).toEqual([b.min[0], b.max[0], b.max[2]]);
    expect(a.max[1] - a.min[1]).toBeLessThan(b.max[1] - b.min[1]);
  });
});

describe('MMPX', () => {
  const mmpxJack = port(X440, 'DB0 TX 0');
  const smaJack = port(X310, 'RF A TX/RX');

  it('is a small snap-on connector with no nut', () => {
    const jack = rfPortShapes([0, 0, 5], [0, -1, 0], 'MMPX', 'female');
    expect(jack.tip).toEqual([0, -3.8, 5]);
    expect(jack.shapes.every((s) => !s.sides && s.size[0] < 5)).toBe(true);
    const sma = rfPortShapes([0, 0, 5], [0, -1, 0], 'SMA', 'female');
    expect(Math.abs(jack.tip[1])).toBeLessThan(Math.abs(sma.tip[1]));
  });

  it('gives a cable its own end, on thin coax', () => {
    expect(coaxEnd(mmpxJack)).toEqual({ connector: 'MMPX', gender: 'male' });
    expect(cableTypeLabel(mmpxJack, smaJack)).toBe('MMPX male to SMA male');
    expect(cableTypeLabel(mmpxJack, mmpxJack)).toBe('MMPX male to MMPX male');
    expect(cableDescription(smaJack, mmpxJack)).toBe('Coax cable, MMPX male to SMA male');
    expect(cableGeometry(mmpxJack, smaJack).radius).toBeLessThan(cableGeometry(smaJack, smaJack).radius);
  });

  it('is accepted in a pin list', () => {
    const r = parsePinCsv('name,type,x,y,z,gender,connector\nTX0,RF,1,2,3,female,mmpx\n', () => 'id');
    expect(r.errors).toEqual([]);
    expect(r.pins[0].connector).toBe('MMPX');
  });
});

describe('USRPs on the bench', () => {
  it('wires an X440 to an X310 and shares a 10 MHz reference, with no problems reported', () => {
    const d = doc(
      [inst('X440', X440), inst('X310', X310, 300)],
      [
        coax(ref('X440', X440, 'DB0 TX 0'), ref('X310', X310, 'RF A RX2')),
        coax(ref('X310', X310, 'REF OUT'), ref('X440', X440, 'REF IN')),
        coax(ref('X310', X310, 'PPS OUT'), ref('X440', X440, 'PPS IN')),
      ],
    );
    expect(analyse(d, parts).issues).toEqual([]);
    const cables = billOfMaterials(d, parts).filter((l) => l.kind === 'cable');
    expect(cables.some((l) => l.item.startsWith('Coax cable MMPX male to SMA male'))).toBe(true);
    expect(cables.filter((l) => l.item.startsWith('Coax cable SMA male to SMA male')).reduce((s, l) => s + l.qty, 0)).toBe(2);
  });

  it('still reports two cables on one port', () => {
    const d = doc(
      [inst('X410', X410), inst('B200', B200, 300), inst('N210', N210, 0, 300)],
      [
        coax(ref('X410', X410, 'DB0 RF0 TX/RX 0'), ref('B200', B200, 'RX2')),
        coax(ref('X410', X410, 'DB0 RF0 TX/RX 0'), ref('N210', N210, 'RF1')),
      ],
    );
    expect(analyse(d, parts).issues.map((i) => i.rule)).toEqual(['rf-port-crowded']);
  });
});
