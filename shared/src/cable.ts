import type { Cable, Pin, PinType, RfConnector, Vec3 } from './types';
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
  coax: '#b5793f',
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
  CABLE_COLORS.coax,
  CABLE_COLORS.ground,
];

/** Red for power, black for ground, and the palette in turn for signals. */
export function autoCableColor(a: PinType, b: PinType, existing: Cable[]): string {
  if (a === 'RF' || b === 'RF') return CABLE_COLORS.coax;
  if (a === 'USB' || b === 'USB') return CABLE_COLORS.usb;
  if (a === 'GND' || b === 'GND') return CABLE_COLORS.ground;
  if (a === '5V' || b === '5V' || a === 'VIN' || b === 'VIN') return CABLE_COLORS.power5;
  if (a === '3V3' || b === '3V3') return CABLE_COLORS.power3;
  const used = existing.filter((c) => SIGNAL_PALETTE.includes(c.color)).length;
  return SIGNAL_PALETTE[used % SIGNAL_PALETTE.length];
}

export type CableKind = 'jumper' | 'usb' | 'coax';

/** The jumper end that fits a pin: a female end goes on a male pin, a male end into a socket or hole. */
export function jumperEnd(pin: Pin): 'M' | 'F' {
  return pin.gender === 'male' ? 'F' : 'M';
}

/** A cable is coax when either end is an RF port, USB when either end is a USB port, else a jumper wire. */
export function cableKind(a: Pin, b: Pin): CableKind {
  if (a.type === 'RF' || b.type === 'RF') return 'coax';
  return a.type === 'USB' || b.type === 'USB' ? 'usb' : 'jumper';
}

export interface CoaxConnectorSize {
  label: string;
  /** Outer diameter of the cable-side plug. */
  diameter: number;
  /** Length of the cable-side connector. */
  length: number;
  /** How far a plug slides back over the jack it screws onto. */
  overlap: number;
  /** Radius of the coax normally used with it. */
  cableRadius: number;
  metal: 'gold' | 'silver';
  /** The plug has a hex coupling nut. Bayonet and snap-on plugs are round. */
  hexNut: boolean;
}

/** Approximate sizes of each connector family, used to draw cable ends. */
export const COAX_CONNECTORS: Record<RfConnector, CoaxConnectorSize> = {
  SMA: { label: 'SMA', diameter: 8, length: 12, overlap: 6, cableRadius: 1.3, metal: 'gold', hexNut: true },
  BNC: { label: 'BNC', diameter: 14.5, length: 22, overlap: 9, cableRadius: 2.5, metal: 'silver', hexNut: false },
  N: { label: 'N', diameter: 20, length: 28, overlap: 10, cableRadius: 3.4, metal: 'silver', hexNut: true },
  UFL: { label: 'U.FL', diameter: 2.6, length: 2.4, overlap: 0, cableRadius: 0.55, metal: 'gold', hexNut: false },
  MMPX: { label: 'MMPX', diameter: 3.8, length: 7.5, overlap: 2.5, cableRadius: 0.9, metal: 'gold', hexNut: false },
};

/** The end of a coax cable that mates with a port. Undefined for a pin that is not an RF port. */
export function coaxEnd(pin: Pin): { connector: RfConnector; gender: 'male' | 'female' } | undefined {
  if (pin.type !== 'RF') return undefined;
  return { connector: pin.connector ?? 'SMA', gender: pin.gender === 'male' ? 'female' : 'male' };
}

function coaxEndLabel(pin: Pin): string {
  const end = coaxEnd(pin);
  return end ? `${COAX_CONNECTORS[end.connector].label} ${end.gender}` : 'bare end';
}

/** "M-F", "F-F" or "M-M" for a jumper, "USB", or the two ends of a coax cable such as "SMA male to BNC male". */
export function cableTypeLabel(a: Pin, b: Pin): string {
  const kind = cableKind(a, b);
  if (kind === 'coax') {
    // Sorted, so A to B and B to A read the same. A bare end goes last.
    const ends = [coaxEndLabel(a), coaxEndLabel(b)].sort((x, y) => (x === 'bare end' ? 1 : y === 'bare end' ? -1 : x.localeCompare(y)));
    return ends.join(' to ');
  }
  if (kind === 'usb') return 'USB';
  const ends = [jumperEnd(a), jumperEnd(b)].sort().reverse();
  return `${ends[0]}-${ends[1]}`;
}

/** What to call a cable in the inspector, e.g. "Coax cable, SMA male to SMA male". */
export function cableDescription(a: Pin, b: Pin): string {
  const kind = cableKind(a, b);
  if (kind === 'coax') return `Coax cable, ${cableTypeLabel(a, b)}`;
  if (kind === 'usb') return 'USB cable';
  return `Jumper wire ${cableTypeLabel(a, b)}`;
}

/** Length of the plastic housing on a jumper end. */
export const HOUSING_LENGTH = 12;
const LEAD_OUT = 5;

/** How a cable is drawn: its thickness, and how far each end runs straight out of its pin. */
export interface CableGeometry {
  kind: CableKind;
  radius: number;
  housingA: number;
  housingB: number;
  leadOut: number;
}

export const JUMPER_GEOMETRY: CableGeometry = { kind: 'jumper', radius: 0.65, housingA: HOUSING_LENGTH, housingB: HOUSING_LENGTH, leadOut: LEAD_OUT };

export function cableGeometry(a: Pin, b: Pin): CableGeometry {
  const kind = cableKind(a, b);
  if (kind === 'jumper') return JUMPER_GEOMETRY;
  if (kind === 'usb') return { kind, radius: 1.7, housingA: 14, housingB: 14, leadOut: LEAD_OUT };
  const sizeA = coaxEnd(a) && COAX_CONNECTORS[coaxEnd(a)!.connector];
  const sizeB = coaxEnd(b) && COAX_CONNECTORS[coaxEnd(b)!.connector];
  // The thinner of the two cables: an SMA to U.FL pigtail is thin all the way.
  const radius = Math.min(sizeA?.cableRadius ?? Infinity, sizeB?.cableRadius ?? Infinity);
  const housing = (size: CoaxConnectorSize | undefined): number => (size ? size.length - size.overlap : 4);
  // Coax is stiff, so it runs straight for longer before it bends.
  return { kind, radius, housingA: housing(sizeA), housingB: housing(sizeB), leadOut: Math.max(4, radius * 6) };
}

export interface CableEnd {
  position: Vec3;
  normal: Vec3;
}

/**
 * The points a cable passes through. Each end leaves its pin along the pin's normal,
 * then the wire arches over to the other side. Control points replace the automatic arch.
 */
export function cableKeyPoints(
  a: CableEnd,
  b: CableEnd,
  controlPoints: Vec3[],
  geometry: Pick<CableGeometry, 'housingA' | 'housingB' | 'leadOut'> = JUMPER_GEOMETRY,
): Vec3[] {
  const a0 = add(a.position, scale(a.normal, geometry.housingA));
  const b0 = add(b.position, scale(b.normal, geometry.housingB));
  // Two ports that face each other at short range: the straight runs would pass each other
  // and knot the cable, so they are shortened to fit the gap.
  let lead = geometry.leadOut;
  const gap = dist(a0, b0);
  const facing = dist(add(a0, scale(a.normal, lead)), add(b0, scale(b.normal, lead))) < gap;
  if (facing) lead = Math.min(lead, gap / 3);
  const a1 = add(a0, scale(a.normal, lead));
  const b1 = add(b0, scale(b.normal, lead));
  let middle: Vec3[];
  if (controlPoints.length > 0) {
    middle = controlPoints;
  } else {
    const span = dist(a1, b1);
    const mid = lerp(a1, b1, 0.5);
    // Pins side by side need a visible loop. Ports that face each other do not, so a short run stays nearly straight.
    const arch = Math.min(30, Math.max(facing ? 0 : 3, span * 0.16));
    middle = [[mid[0], mid[1], Math.max(mid[2] + arch, 2)]];
  }
  return [a0, a1, ...middle, b1, b0];
}

/** Rough wire length: straight runs between the key points, plus slack for the curve. */
export function cableLength(a: CableEnd, b: CableEnd, controlPoints: Vec3[], geometry = JUMPER_GEOMETRY): number {
  const pts = [a.position, ...cableKeyPoints(a, b, controlPoints, geometry), b.position];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total * 1.05;
}

/** The shortest standard jumper that reaches. */
export function standardJumperLength(mm: number): string {
  for (const cm of [10, 20, 30, 40]) if (mm <= cm * 10) return `${cm} cm`;
  return `${Math.ceil(mm / 100) * 10} cm`;
}

/** The shortest standard coax cable that reaches. */
export function standardCoaxLength(mm: number): string {
  for (const cm of [15, 30, 50, 100, 200]) if (mm <= cm * 10) return `${cm} cm`;
  return `${Math.ceil(mm / 1000)} m`;
}
