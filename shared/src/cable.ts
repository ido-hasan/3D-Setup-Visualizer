import type { Cable, Pin, PinType, Vec3 } from './types';
import { add, dist, lerp, scale } from './vec';

export const POWER_TYPES: PinType[] = ['5V', '3V3', 'VIN'];
export const SIGNAL_TYPES: PinType[] = [
  'GPIO',
  'ANALOG',
  'I2C_SDA',
  'I2C_SCL',
  'UART_TX',
  'UART_RX',
  'SPI_MOSI',
  'SPI_MISO',
  'SPI_SCK',
  'SPI_CS',
];
export const isPower = (t: PinType): boolean => POWER_TYPES.includes(t);
export const isSignal = (t: PinType): boolean => SIGNAL_TYPES.includes(t);

export const CABLE_COLORS = {
  power5: '#d6392c',
  power3: '#f08a24',
  ground: '#1c1c1e',
  usb: '#3b3f46',
};

/** Colours given to signal wires in turn. */
export const SIGNAL_PALETTE = ['#f2c230', '#2f6fd6', '#2fa84f', '#8d4bc4', '#f4f4f0', '#8a5a3c', '#8f979f', '#e36fa8'];

/** Every colour offered in the picker. */
export const CABLE_SWATCHES = [
  CABLE_COLORS.power5,
  CABLE_COLORS.power3,
  ...SIGNAL_PALETTE.slice(0, 4),
  SIGNAL_PALETTE[4],
  SIGNAL_PALETTE[5],
  SIGNAL_PALETTE[6],
  SIGNAL_PALETTE[7],
  CABLE_COLORS.ground,
];

/** Red for power, black for ground, and the palette in turn for signals. */
export function autoCableColor(a: PinType, b: PinType, existing: Cable[]): string {
  if (a === 'USB' || b === 'USB') return CABLE_COLORS.usb;
  if (a === 'GND' || b === 'GND') return CABLE_COLORS.ground;
  if (a === '5V' || b === '5V' || a === 'VIN' || b === 'VIN') return CABLE_COLORS.power5;
  if (a === '3V3' || b === '3V3') return CABLE_COLORS.power3;
  const used = existing.filter((c) => SIGNAL_PALETTE.includes(c.color)).length;
  return SIGNAL_PALETTE[used % SIGNAL_PALETTE.length];
}

export type CableKind = 'jumper' | 'usb';

/** The jumper end that fits a pin: a female end goes on a male pin, a male end into a socket or hole. */
export function jumperEnd(pin: Pin): 'M' | 'F' {
  return pin.gender === 'male' ? 'F' : 'M';
}

export function cableKind(a: Pin, b: Pin): CableKind {
  return a.type === 'USB' || b.type === 'USB' ? 'usb' : 'jumper';
}

/** "M-F", "F-F", "M-M" or "USB". */
export function cableTypeLabel(a: Pin, b: Pin): string {
  if (cableKind(a, b) === 'usb') return 'USB';
  const ends = [jumperEnd(a), jumperEnd(b)].sort().reverse();
  return `${ends[0]}-${ends[1]}`;
}

/** Length of the plastic housing on a jumper end. */
export const HOUSING_LENGTH = 12;
const LEAD_OUT = 5;

export interface CableEnd {
  position: Vec3;
  normal: Vec3;
}

/**
 * The points a cable passes through. Each end leaves its pin along the pin's normal,
 * then the wire arches over to the other side. Control points replace the automatic arch.
 */
export function cableKeyPoints(a: CableEnd, b: CableEnd, controlPoints: Vec3[], housing = HOUSING_LENGTH): Vec3[] {
  const a0 = add(a.position, scale(a.normal, housing));
  const a1 = add(a0, scale(a.normal, LEAD_OUT));
  const b0 = add(b.position, scale(b.normal, housing));
  const b1 = add(b0, scale(b.normal, LEAD_OUT));
  let middle: Vec3[];
  if (controlPoints.length > 0) {
    middle = controlPoints;
  } else {
    const span = dist(a1, b1);
    const mid = lerp(a1, b1, 0.5);
    const arch = Math.min(30, Math.max(3, span * 0.16));
    middle = [[mid[0], mid[1], Math.max(mid[2] + arch, 2)]];
  }
  return [a0, a1, ...middle, b1, b0];
}

/** Rough wire length: straight runs between the key points, plus slack for the curve. */
export function cableLength(a: CableEnd, b: CableEnd, controlPoints: Vec3[]): number {
  const pts = [a.position, ...cableKeyPoints(a, b, controlPoints), b.position];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total * 1.05;
}

/** The shortest standard jumper that reaches. */
export function standardJumperLength(mm: number): string {
  for (const cm of [10, 20, 30, 40]) if (mm <= cm * 10) return `${cm} cm`;
  return `${Math.ceil(mm / 100) * 10} cm`;
}
