import { describe, expect, it } from 'vitest';
import {
  autoCableColor,
  billOfMaterials,
  bomCsv,
  cableKeyPoints,
  CABLE_COLORS,
  exportPinJson,
  parsePinCsv,
  parsePinJson,
  SIGNAL_PALETTE,
  wiringCsv,
  wiringList,
} from '../src/index';
import { BB, CH340, PI, UNO, cable, doc, inst, parts } from './helpers';

describe('cables', () => {
  it('colours power red, ground black and signals from the palette in turn', () => {
    expect(autoCableColor('5V', 'GPIO', [])).toBe(CABLE_COLORS.power5);
    expect(autoCableColor('GND', '5V', [])).toBe(CABLE_COLORS.ground);
    expect(autoCableColor('3V3', 'OTHER', [])).toBe(CABLE_COLORS.power3);
    const first = autoCableColor('GPIO', 'GPIO', []);
    expect(first).toBe(SIGNAL_PALETTE[0]);
    const second = autoCableColor('GPIO', 'GPIO', [{ ...cable('u', UNO, 'D2', 'u', UNO, 'D3'), color: first }]);
    expect(second).toBe(SIGNAL_PALETTE[1]);
  });

  it('leaves each pin along its normal and arches in between', () => {
    const pts = cableKeyPoints({ position: [0, 0, 10], normal: [0, 0, 1] }, { position: [100, 0, 10], normal: [0, 0, 1] }, []);
    expect(pts[0]).toEqual([0, 0, 22]);
    expect(pts.at(-1)).toEqual([100, 0, 22]);
    expect(pts[2][2]).toBeGreaterThan(pts[1][2]); // the middle is the highest point
    const routed = cableKeyPoints({ position: [0, 0, 10], normal: [0, 0, 1] }, { position: [100, 0, 10], normal: [0, 0, 1] }, [[50, 40, 5]]);
    expect(routed[2]).toEqual([50, 40, 5]);
  });
});

describe('wiring list and bill of materials', () => {
  const d = doc(
    [inst('Uno', UNO), inst('Pi', PI, 150), inst('Board', BB, 0, 100), inst('Serial', CH340, 0, -80)],
    [
      { ...cable('Uno', UNO, 'GND', 'Pi', PI, 'GND (pin 6)'), label: 'ground, "common"' },
      cable('Uno', UNO, 'D2', 'Board', BB, 'a1'),
      cable('Pi', PI, 'GPIO17 (pin 11)', 'Board', BB, 'e1'),
      { ...cable('Serial', CH340, 'TXD', 'Uno', UNO, 'D0/RX'), from: { instanceId: 'Serial', pinId: 'usb-0' }, to: { instanceId: 'Pi', pinId: 'usb-1' } },
    ],
  );

  it('lists every cable with its ends and jumper type', () => {
    const rows = wiringList(d, parts);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ fromBoard: 'Uno', fromPin: 'GND', toBoard: 'Pi', toPin: 'GND (pin 6)', type: 'M-F' });
    expect(rows[1].type).toBe('M-M'); // socket to breadboard hole
    expect(rows[2].type).toBe('M-F'); // male header to breadboard hole
    expect(rows[3].type).toBe('USB');
    const csv = wiringCsv(rows);
    expect(csv.split('\r\n')[0]).toBe('#,From board,From pin,To board,To pin,Colour,Label,Type,Length (mm)');
    expect(csv).toContain('"ground, ""common"""');
  });

  it('counts boards and cables', () => {
    const bom = billOfMaterials(d, parts);
    expect(bom.filter((l) => l.kind === 'board')).toHaveLength(4);
    const cables = bom.filter((l) => l.kind === 'cable');
    expect(cables.reduce((s, l) => s + l.qty, 0)).toBe(4);
    expect(cables.some((l) => l.item === 'USB cable' && l.qty === 1)).toBe(true);
    expect(cables.some((l) => l.item.startsWith('Jumper wire M-F'))).toBe(true);
    expect(bomCsv(bom)).toContain('board,Arduino Uno R3,1');
  });
});

describe('pin import', () => {
  let n = 0;
  const id = () => `p${++n}`;

  it('reads a CSV pin list', () => {
    const r = parsePinCsv('name,type,x,y,z,gender,limit\nGND,GND,1,2,3,female,\nSDA,sda,4.5,5,6,,3.3\n', id);
    expect(r.errors).toEqual([]);
    expect(r.pins).toHaveLength(2);
    expect(r.pins[0]).toMatchObject({ name: 'GND', type: 'GND', position: [1, 2, 3], gender: 'female', normal: [0, 0, 1] });
    expect(r.pins[1]).toMatchObject({ type: 'I2C_SDA', voltageLimit: 3.3, gender: 'male' });
  });

  it('explains what is wrong with a bad file', () => {
    expect(parsePinCsv('name,type\nA,GPIO\n', id).errors[0]).toContain('"x"');
    const r = parsePinCsv('name,type,x,y,z\nA,WAT,1,2,3\nB,GPIO,one,2,3\n,GPIO,1,2,3\n', id);
    expect(r.pins).toHaveLength(0);
    expect(r.errors).toHaveLength(3);
    expect(parsePinJson('{nope', id).errors[0]).toContain('not valid JSON');
  });

  it('round-trips pins and strips through JSON', () => {
    const uno = parts[UNO];
    const text = exportPinJson(uno.pins, uno.strips);
    const back = parsePinJson(text, id);
    expect(back.errors).toEqual([]);
    expect(back.pins).toHaveLength(uno.pins.length);
    expect(back.strips).toHaveLength(uno.strips.length);
    expect(back.strips[0]).toMatchObject({ name: uno.strips[0].name, count: uno.strips[0].count, overrides: uno.strips[0].overrides });
  });
});
