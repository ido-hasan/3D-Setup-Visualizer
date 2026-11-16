import type { Part } from '../types';
import { BACK, BLACK, Body, DARK, FRONT, LEFT, RIGHT } from './body';
import { SILVER } from './builder';

const CASE = '#e2e4e7';
const PANEL = '#3a3d42';
const NOTE = 'Simplified model drawn by the app. Port positions are approximate.';
const NOTE_NETWORKED = `${NOTE} The network ports are drawn but cannot be wired.`;

const sdr = (id: string, name: string, note = NOTE): Pick<Part, 'id' | 'name'> & Partial<Part> => ({ id, name, category: 'SDR', note });

/**
 * A rack-style case with a front panel on the -Y side and a rear panel on the +Y side.
 * Returns the builder and the Y of each panel face, where connectors start.
 */
function instrumentCase(width: number, depth: number, height: number, color = CASE, panel = PANEL): { b: Body; front: number; rear: number } {
  const plate = 0.8;
  const b = new Body()
    .box([0, 0, height / 2], [width, depth, height], color)
    .box([0, -depth / 2 - plate / 2, height / 2], [width, plate, height], panel)
    .box([0, depth / 2 + plate / 2, height / 2], [width, plate, height], panel);
  return { b, front: -depth / 2 - plate, rear: depth / 2 + plate };
}

/** A connector that is drawn but takes no cable in the app, such as an Ethernet or SFP+ port. */
function drawn(b: Body, x: number, faceY: number, z: number, width: number, height: number, color: string): void {
  const out = faceY < 0 ? -1 : 1;
  b.box([x, faceY + out * 0.6, z], [width, 1.2, height], color);
}

/** A USB socket on a panel, with the pin a USB cable connects to. */
function usbSocket(b: Body, name: string, x: number, faceY: number, z: number, width: number, height: number): void {
  drawn(b, x, faceY, z, width, height, SILVER);
  b.usb(name, [x, faceY + (faceY < 0 ? -1.2 : 1.2), z], faceY < 0 ? FRONT : BACK);
}

function rtlSdr(): Part {
  return new Body()
    .box([0, 0, 6], [66, 26, 12], '#b9bcc2')
    .box([-34, 0, 6], [2, 26, 12], DARK)
    .box([34, 0, 6], [2, 26, 12], DARK)
    .box([-42, 0, 6], [14, 12, 4.5], SILVER)
    .usb('USB plug', [-49, 0, 6], LEFT, 'male')
    .port('ANT', [35, 0, 6], RIGHT)
    .build(sdr('builtin:rf-rtl-sdr', 'RTL-SDR dongle', 'Simplified model drawn by the app. Sizes are approximate.'));
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
  return b.build(sdr('builtin:rf-hackrf-one', 'HackRF One', 'Simplified model drawn by the app. Sizes are approximate.'));
}

// USRP B-series: USB radios.

function usrpB200(): Part {
  const height = 28;
  const z = height / 2;
  const { b, front, rear } = instrumentCase(160, 100, height, '#c4c7cc', DARK);
  // Front: the RF A pair, with the status lights beside it.
  b.port('TX/RX', [36, front, z], FRONT).port('RX2', [58, front, z], FRONT);
  ['#3fbf4f', '#f2c230', '#d6392c'].forEach((color, i) => b.box([4 + i * 7, front - 0.3, z], [2.5, 0.6, 2.5], color));
  // Rear: timing inputs, USB and power.
  b.port('GPS', [-62, rear, z], BACK).port('PPS', [-42, rear, z], BACK).port('REF 10 MHz', [-22, rear, z], BACK);
  usbSocket(b, 'USB 3.0', 30, rear, z, 12, 11);
  b.cyl([58, rear + 0.6, z], 9, 1.2, 'y', BLACK);
  return b.build(sdr('builtin:sdr-usrp-b200', 'USRP B200'));
}

function usrpB205mini(): Part {
  const z = 7;
  const b = new Body()
    .box([0, 0, z], [87, 54, 14], '#c9ccd1')
    .box([0, 0, 14.1], [60, 30, 0.2], '#b3b7bd')
    .port('TRX', [43.5, 12, z], RIGHT)
    .port('RX2', [43.5, -12, z], RIGHT)
    .port('REF', [22, -27, z], FRONT)
    .box([-44.25, 0, z], [1.5, 12, 3.2], SILVER)
    .usb('USB 3.0', [-45, 0, z], LEFT);
  return b.build(sdr('builtin:sdr-usrp-b205mini', 'USRP B205mini-i'));
}

// USRP N-series: networked over Gigabit Ethernet.

function usrpN210(): Part {
  const height = 50;
  const z = height / 2;
  const { b, front } = instrumentCase(220, 160, height, '#d3d5d9', '#eceef0');
  b.port('RF1', [-92, front, z], FRONT).port('RF2', [-72, front, z], FRONT);
  b.port('REF CLOCK', [-40, front, z], FRONT).port('PPS IN', [-22, front, z], FRONT);
  drawn(b, 6, front, z, 16, 9, DARK); // MIMO expansion
  drawn(b, 36, front, z, 16, 13, SILVER); // Gigabit Ethernet
  ['#3fbf4f', '#3fbf4f', '#f2c230', '#f2c230', '#d6392c', '#3fbf4f'].forEach((color, i) => b.box([56 + i * 4.5, front - 0.3, z], [2, 0.6, 2], color));
  b.cyl([96, front - 0.6, z], 9, 1.2, 'y', BLACK); // power jack
  return b.build(sdr('builtin:sdr-usrp-n210', 'USRP N210', NOTE_NETWORKED));
}

// USRP X-series: half-rack units.

function usrpX310(): Part {
  const height = 39;
  const z = height / 2;
  const { b, front, rear } = instrumentCase(218, 277, height);
  // Front: one TX/RX and RX2 pair for each of the two daughterboard slots.
  b.port('RF A TX/RX', [-92, front, z], FRONT).port('RF A RX2', [-70, front, z], FRONT);
  b.port('RF B TX/RX', [70, front, z], FRONT).port('RF B RX2', [92, front, z], FRONT);
  usbSocket(b, 'JTAG USB', -32, front, z, 12, 11);
  drawn(b, 10, front, z, 34, 11, '#2f6fd6'); // GPIO, DB15
  b.cyl([44, front - 0.4, z], 6, 0.8, 'y', '#3fbf4f'); // power button
  // Rear, seen from behind, left to right: power, two SFP+, PCIe, then the timing connectors.
  drawn(b, 96, rear, z, 14, 12, BLACK);
  drawn(b, 70, rear, z, 15, 10, SILVER);
  drawn(b, 50, rear, z, 15, 10, SILVER);
  drawn(b, 20, rear, z, 24, 10, DARK);
  b.port('REF OUT', [-20, rear, z], BACK).port('REF IN', [-38, rear, z], BACK);
  b.port('PPS OUT', [-56, rear, z], BACK).port('PPS IN', [-74, rear, z], BACK).port('GPS ANT', [-92, rear, z], BACK);
  return b.build(sdr('builtin:sdr-usrp-x310', 'USRP X310', NOTE_NETWORKED));
}

/** The rear panel the X410 and X440 share, seen from behind, left to right. */
function x4xxRear(b: Body, rear: number, z: number): void {
  drawn(b, 96, rear, z, 18, 14, BLACK); // power
  drawn(b, 66, rear, z, 20, 10, SILVER); // QSFP28 0
  drawn(b, 40, rear, z, 20, 10, SILVER); // QSFP28 1
  drawn(b, 14, rear, z, 16, 13, SILVER); // Ethernet
  usbSocket(b, 'USB', -8, rear, z, 9, 3.2);
  b.port('TRIG IN/OUT', [-38, rear, z], BACK).port('PPS IN', [-56, rear, z], BACK);
  b.port('REF IN', [-74, rear, z], BACK).port('GPS ANT', [-92, rear, z], BACK);
}

function x4xxFrontExtras(b: Body, front: number, z: number): void {
  drawn(b, 0, front, z + 8, 15, 6, DARK); // GPIO, HDMI
  drawn(b, 0, front, z - 8, 15, 6, DARK);
  b.cyl([104, front - 0.4, z], 6, 0.8, 'y', '#3fbf4f'); // power button
}

function usrpX410(): Part {
  const height = 44;
  const z = height / 2;
  const { b, front, rear } = instrumentCase(222, 267, height);
  // Front: two daughterboards, two channels each, a TX/RX 0 and an RX 1 port per channel.
  const ports = ['RF0 TX/RX 0', 'RF0 RX 1', 'RF1 TX/RX 0', 'RF1 RX 1'];
  [-60, 60].forEach((centre, db) => ports.forEach((name, i) => b.port(`DB${db} ${name}`, [centre - 30 + i * 20, front, z], FRONT)));
  x4xxFrontExtras(b, front, z);
  x4xxRear(b, rear, z);
  return b.build(sdr('builtin:sdr-usrp-x410', 'USRP X410', NOTE_NETWORKED));
}

function usrpX440(): Part {
  const height = 44;
  const z = height / 2;
  const { b, front, rear } = instrumentCase(222, 267, height);
  // Front: two daughterboards, each with four transmit ports above four receive ports. They are MMPX, not SMA.
  [-60, 60].forEach((centre, db) => {
    for (let i = 0; i < 4; i++) b.port(`DB${db} TX ${i}`, [centre - 27 + i * 18, front, z + 8], FRONT, 'female', 'MMPX');
    for (let i = 0; i < 4; i++) b.port(`DB${db} RX ${i}`, [centre - 27 + i * 18, front, z - 8], FRONT, 'female', 'MMPX');
  });
  x4xxFrontExtras(b, front, z);
  x4xxRear(b, rear, z);
  return b.build(sdr('builtin:sdr-usrp-x440', 'USRP X440', NOTE_NETWORKED));
}

let cache: Part[] | undefined;

export function builtinSdrParts(): Part[] {
  cache ??= [rtlSdr(), hackRf(), usrpB200(), usrpB205mini(), usrpN210(), usrpX310(), usrpX410(), usrpX440()];
  return cache;
}
