import { describe, expect, it } from 'vitest';
import {
  analyse,
  autoCableColor,
  billOfMaterials,
  builtinParts,
  CABLE_COLORS,
  cableDescription,
  cableGeometry,
  cableKind,
  cableTypeLabel,
  coaxEnd,
  expandStrip,
  exportPinJson,
  makeStrip,
  parsePinCsv,
  parsePinJson,
  partPins,
  rfPortShapes,
  wiringList,
  type Cable,
  type Pin,
  type PinRef,
} from '../src/index';
import { UNO, cable, doc, inst, parts, pinId } from './helpers';

const HACKRF = 'builtin:rf-hackrf-one';
const ATT = 'builtin:rf-attenuator';
const LNA = 'builtin:rf-lna';
const WHIP = 'builtin:rf-whip-antenna';
const PATCH = 'builtin:rf-patch-antenna';
const SPLIT = 'builtin:rf-splitter';
const PA = 'builtin:rf-power-amplifier';
const TERM = 'builtin:rf-terminator';

const port = (partId: string, name: string): Pin => partPins(parts[partId]).find((p) => p.name === name)!;
const ref = (instanceId: string, partId: string, name: string): PinRef => ({ instanceId, pinId: port(partId, name).id });
let n = 0;
const coax = (from: PinRef, to: PinRef): Cable => ({ id: `rf${++n}`, from, to, color: CABLE_COLORS.coax, autoColor: true, label: '', controlPoints: [] });
const rules = (d: ReturnType<typeof doc>) => analyse(d, parts).issues.map((i) => i.rule).sort();

describe('bundled RF parts', () => {
  const rf = builtinParts().filter((p) => p.category === 'RF');

  it('ships all eighteen, each with at least one RF port that names its connector', () => {
    expect(rf).toHaveLength(18);
    for (const part of rf) {
      const ports = partPins(part).filter((p) => p.type === 'RF');
      expect(ports.length, part.name).toBeGreaterThan(0);
      for (const p of ports) expect(p.connector, `${part.name} ${p.name}`).toBeDefined();
    }
  });

  it('rests every part on the bench', () => {
    for (const part of rf) expect(part.bbox.min[2], part.name).toBeGreaterThanOrEqual(0);
    // Parts drawn without a board are centred on their base.
    for (const id of [ATT, HACKRF, WHIP, SPLIT]) {
      const b = parts[id].bbox;
      expect(b.min[0] + b.max[0]).toBeCloseTo(0, 2);
      expect(b.min[1] + b.max[1]).toBeCloseTo(0, 2);
      expect(b.min[2]).toBe(0);
    }
  });

  it('gives ports the right connector, gender and direction', () => {
    expect(port(ATT, 'RF (plug)')).toMatchObject({ connector: 'SMA', gender: 'male', normal: [-1, 0, 0] });
    expect(port(ATT, 'RF (jack)')).toMatchObject({ connector: 'SMA', gender: 'female', normal: [1, 0, 0] });
    expect(port(HACKRF, 'ANTENNA')).toMatchObject({ connector: 'SMA', gender: 'female' });
    expect(port(PATCH, 'RF')).toMatchObject({ connector: 'UFL', normal: [0, 0, 1] });
    expect(port(WHIP, 'RF').gender).toBe('male');
    expect(partPins(parts[SPLIT]).filter((p) => p.type === 'RF').map((p) => p.name)).toEqual(['SUM', 'OUT 1', 'OUT 2']);
  });

  it('gives modules their power and control pins, and instruments a USB port', () => {
    expect(port(LNA, 'VCC 5V').type).toBe('5V');
    expect(port(PA, 'VCC 12V').type).toBe('VIN');
    expect(port('builtin:rf-switch', 'CTRL')).toMatchObject({ type: 'GPIO', voltageLimit: 5 });
    expect(port('builtin:rf-bias-tee', 'DC').type).toBe('VIN');
    for (const id of [HACKRF, 'builtin:rf-rtl-sdr', 'builtin:rf-nanovna', 'builtin:rf-tinysa']) {
      expect(partPins(parts[id]).some((p) => p.type === 'USB'), id).toBe(true);
    }
  });

  it('draws a jack as a barrel and a plug as a hex nut, with the cable meeting the tip', () => {
    const jack = rfPortShapes([10, 0, 5], [1, 0, 0], 'SMA', 'female');
    expect(jack.tip).toEqual([18.4, 0, 5]);
    expect(jack.shapes.every((s) => s.kind === 'cyl' && s.axis === 'x')).toBe(true);
    const plug = rfPortShapes([0, 0, 5], [0, -1, 0], 'SMA', 'male');
    expect(plug.tip).toEqual([0, -8, 5]);
    expect(plug.shapes[0]).toMatchObject({ sides: 6, axis: 'y' });
    expect(rfPortShapes([0, 0, 0], [0, 0, 1], 'N', 'female').tip[2]).toBeGreaterThan(jack.tip[0] - 10);
  });
});

describe('coax cables', () => {
  const smaJack = port(HACKRF, 'ANTENNA');
  const smaPlug = port(WHIP, 'RF');
  const ufl = port(PATCH, 'RF');
  const gpio = partPins(parts[UNO]).find((p) => p.name === 'D2')!;
  const bnc: Pin = { ...smaJack, connector: 'BNC' };
  const nType: Pin = { ...smaJack, connector: 'N' };

  it('is the cable kind whenever an RF port is involved', () => {
    expect(cableKind(smaJack, smaJack)).toBe('coax');
    expect(cableKind(smaJack, gpio)).toBe('coax');
    expect(cableKind(gpio, gpio)).toBe('jumper');
  });

  it('takes the mating end for each port', () => {
    expect(coaxEnd(smaJack)).toEqual({ connector: 'SMA', gender: 'male' });
    expect(coaxEnd(smaPlug)).toEqual({ connector: 'SMA', gender: 'female' });
    expect(coaxEnd(gpio)).toBeUndefined();
    expect(cableTypeLabel(smaJack, smaJack)).toBe('SMA male to SMA male');
    expect(cableTypeLabel(smaJack, smaPlug)).toBe('SMA female to SMA male');
    expect(cableTypeLabel(smaJack, bnc)).toBe('BNC male to SMA male');
    expect(cableTypeLabel(bnc, smaJack)).toBe('BNC male to SMA male'); // same either way round
    expect(cableTypeLabel(ufl, nType)).toBe('N male to U.FL male');
    expect(cableTypeLabel(gpio, smaJack)).toBe('SMA male to bare end');
    expect(cableDescription(smaJack, smaJack)).toBe('Coax cable, SMA male to SMA male');
    expect(cableDescription(gpio, gpio)).toBe('Jumper wire M-M');
  });

  it('is thicker than a jumper, and thin when one end is U.FL', () => {
    const jumper = cableGeometry(gpio, gpio);
    const sma = cableGeometry(smaJack, smaJack);
    expect(sma.kind).toBe('coax');
    expect(sma.radius).toBeGreaterThan(jumper.radius);
    expect(cableGeometry(bnc, bnc).radius).toBeGreaterThan(sma.radius);
    expect(cableGeometry(smaJack, ufl).radius).toBeLessThan(jumper.radius);
    expect(sma.leadOut).toBeGreaterThan(jumper.leadOut);
  });

  it('gets its own colour', () => {
    expect(autoCableColor('RF', 'RF', [])).toBe(CABLE_COLORS.coax);
    expect(autoCableColor('RF', 'GND', [])).toBe(CABLE_COLORS.coax);
  });

  it('is listed in the wiring list and the bill of materials', () => {
    const d = doc(
      [inst('SDR', HACKRF), inst('Pad', ATT, 120), inst('Amp', LNA, 180), inst('Antenna', WHIP, 260)],
      [
        coax(ref('SDR', HACKRF, 'ANTENNA'), ref('Pad', ATT, 'RF (jack)')),
        coax(ref('Pad', ATT, 'RF (plug)'), ref('Amp', LNA, 'RF OUT')),
        coax(ref('Amp', LNA, 'RF IN'), ref('Antenna', WHIP, 'RF')),
      ],
    );
    const rows = wiringList(d, parts);
    expect(rows.map((r) => r.type)).toEqual(['SMA male to SMA male', 'SMA female to SMA male', 'SMA female to SMA male']);
    expect(rows[0]).toMatchObject({ fromBoard: 'SDR', fromPin: 'ANTENNA', toBoard: 'Pad', toPin: 'RF (jack)' });
    const cables = billOfMaterials(d, parts).filter((l) => l.kind === 'cable');
    expect(cables.reduce((sum, l) => sum + l.qty, 0)).toBe(3);
    expect(cables.every((l) => /^Coax cable SMA (fe)?male to SMA male, \d+ cm$/.test(l.item))).toBe(true);
    // The two plug-to-jack runs may differ in length, so they can be on separate lines.
    const plugToJack = cables.filter((l) => l.item.startsWith('Coax cable SMA female to SMA male'));
    expect(plugToJack.reduce((sum, l) => sum + l.qty, 0)).toBe(2);
  });
});

describe('RF checks', () => {
  const chain = () => [inst('SDR', HACKRF), inst('Amp', LNA, 150), inst('Antenna', WHIP, 240), inst('Uno', UNO, 0, -120)];
  const sdrToAmp = () => coax(ref('SDR', HACKRF, 'ANTENNA'), ref('Amp', LNA, 'RF OUT'));
  const ampPower = () => [cable('Uno', UNO, '5V', 'Amp', LNA, 'VCC 5V'), cable('Uno', UNO, 'GND', 'Amp', LNA, 'GND')];

  it('passes a clean receive chain', () => {
    const d = doc(chain(), [sdrToAmp(), coax(ref('Amp', LNA, 'RF IN'), ref('Antenna', WHIP, 'RF')), ...ampPower()]);
    expect(rules(d)).toEqual([]);
  });

  it('flags an RF port wired to an ordinary pin', () => {
    const wrong = coax(ref('SDR', HACKRF, 'ANTENNA'), { instanceId: 'Uno', pinId: pinId(parts[UNO], 'D2') });
    const issues = analyse(doc(chain(), [wrong]), parts).issues.filter((i) => i.rule === 'rf-wrong-pin');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', cableIds: [wrong.id] });
    expect(issues[0].message).toContain('SDR · ANTENNA');
    expect(issues[0].message).toContain('Uno · D2');
  });

  it('flags two cables on one RF port, and accepts a splitter instead', () => {
    const crowded = doc(chain(), [sdrToAmp(), coax(ref('SDR', HACKRF, 'ANTENNA'), ref('Antenna', WHIP, 'RF')), ...ampPower()]);
    const issue = analyse(crowded, parts).issues.find((i) => i.rule === 'rf-port-crowded')!;
    expect(issue).toMatchObject({ severity: 'error' });
    expect(issue.cableIds).toHaveLength(2);
    expect(issue.message).toContain('SDR · ANTENNA has 2 cables');
    expect(rules(crowded)).toEqual(['rf-port-crowded']);

    const split = doc(
      [...chain(), inst('Split', SPLIT, 80, 60)],
      [
        coax(ref('SDR', HACKRF, 'ANTENNA'), ref('Split', SPLIT, 'SUM')),
        coax(ref('Split', SPLIT, 'OUT 1'), ref('Amp', LNA, 'RF OUT')),
        coax(ref('Split', SPLIT, 'OUT 2'), ref('Antenna', WHIP, 'RF')),
        ...ampPower(),
      ],
    );
    expect(rules(split)).toEqual([]);
  });

  it('treats the coax shield as a common ground, but still wants power', () => {
    // The amplifier has a GND pin with nothing on it. The coax to the SDR grounds it.
    const d = doc(chain(), [sdrToAmp()]);
    expect(rules(d)).toEqual(['no-power']);
    expect(analyse(d, parts).issues[0].message).toContain('Amp');
    // A jumper wire that is not coax gives no such ground.
    const jumperOnly = doc(chain(), [cable('Uno', UNO, '5V', 'Amp', LNA, 'VCC 5V')]);
    expect(rules(jumperOnly)).toEqual(['no-ground', 'no-ground']);
  });

  it('does not treat a coax cable on an ordinary pin as a ground', () => {
    const wrong = coax(ref('Amp', LNA, 'RF IN'), { instanceId: 'Uno', pinId: pinId(parts[UNO], 'D2') });
    expect(rules(doc(chain(), [wrong, cable('Uno', UNO, '5V', 'Amp', LNA, 'VCC 5V')]))).toEqual(['no-ground', 'no-ground', 'rf-wrong-pin']);
  });

  it('says nothing about passive parts with no power pins', () => {
    const d = doc([inst('SDR', HACKRF), inst('Load', TERM, 100)], [coax(ref('SDR', HACKRF, 'ANTENNA'), ref('Load', TERM, 'RF'))]);
    expect(rules(d)).toEqual([]);
  });
});

describe('RF ports on your own parts', () => {
  let k = 0;
  const id = () => `x${++k}`;

  it('reads the connector column from CSV, with SMA as the default', () => {
    const r = parsePinCsv('name,type,x,y,z,gender,connector\nANT,RF,1,2,3,female,bnc\nGPS,ant,4,5,6,female,U.FL\nLO,rf,7,8,9,female,\nD2,GPIO,0,0,0,male,sma\n', id);
    expect(r.errors).toEqual([]);
    expect(r.pins.map((p) => [p.name, p.type, p.connector])).toEqual([
      ['ANT', 'RF', 'BNC'],
      ['GPS', 'RF', 'UFL'],
      ['LO', 'RF', 'SMA'],
      ['D2', 'GPIO', undefined],
    ]);
  });

  it('refuses a connector it does not know', () => {
    const r = parsePinCsv('name,type,x,y,z,connector\nANT,RF,1,2,3,TNC\n', id);
    expect(r.pins).toHaveLength(0);
    expect(r.errors[0]).toContain('unknown connector "TNC"');
  });

  it('round-trips RF ports and strips through JSON', () => {
    const hack = parts[HACKRF];
    const back = parsePinJson(exportPinJson(hack.pins, []), id);
    expect(back.errors).toEqual([]);
    expect(back.pins.filter((p) => p.type === 'RF').map((p) => p.connector)).toEqual(['SMA', 'SMA', 'SMA']);
    const strip = { ...makeStrip([0, 0, 0], [5.08, 0, 0], { id: 's', name: 'RF', type: 'RF' }), connector: 'N' as const };
    const again = parsePinJson(exportPinJson([], [strip]), id);
    expect(again.strips[0]).toMatchObject({ type: 'RF', connector: 'N', count: 3 });
  });

  it('gives the RF pins of a strip the strip connector', () => {
    const strip = makeStrip([0, 0, 0], [5.08, 0, 0], { id: 's', name: 'J', type: 'RF' });
    expect(expandStrip(strip).map((p) => p.connector)).toEqual(['SMA', 'SMA', 'SMA']);
    const mixed = { ...strip, type: 'GPIO' as const, connector: 'BNC' as const, overrides: { 1: { type: 'RF' as const } } };
    expect(expandStrip(mixed).map((p) => p.connector)).toEqual([undefined, 'BNC', undefined]);
  });
});
