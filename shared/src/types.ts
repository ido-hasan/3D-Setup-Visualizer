/** All lengths are millimetres. The bench is the XY plane and Z points up. */
export type Vec3 = [number, number, number];

export const PIN_TYPES = [
  '5V',
  '3V3',
  'VIN',
  'GND',
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
  'USB',
  'OTHER',
] as const;
export type PinType = (typeof PIN_TYPES)[number];

/** male = a pin you push a female jumper onto, female = a socket, hole = breadboard hole. */
export type PinGender = 'male' | 'female' | 'hole';
export const PIN_GENDERS: PinGender[] = ['male', 'female', 'hole'];

export interface Pin {
  id: string;
  name: string;
  type: PinType;
  /**
   * 3.3 = must never see more than 3.3 V. 5 = explicitly 5 V tolerant.
   * Undefined = follow the part's logic voltage.
   */
  voltageLimit?: 3.3 | 5;
  /** Position in the part's own frame. */
  position: Vec3;
  /** Unit vector: the direction a cable leaves the pin. */
  normal: Vec3;
  gender: PinGender;
  /** Set on pins generated from a strip. */
  stripId?: string;
  /** Index of the pin inside its strip. */
  stripIndex?: number;
  /** Breadboards only: holes that share a group are connected inside the board. */
  group?: string;
}

export interface StripPinOverride {
  name?: string;
  type?: PinType;
  voltageLimit?: 3.3 | 5;
  /** Nudge from the generated position. */
  offset?: Vec3;
  deleted?: boolean;
}

/** A header: evenly spaced pins in one or two rows. Pins are generated from these numbers. */
export interface Strip {
  id: string;
  name: string;
  /** First pin of row 0. */
  start: Vec3;
  /** Last pin of row 0. Kept equal to start + direction * pitch * (count - 1). */
  end: Vec3;
  /** Pins per row. */
  count: number;
  rows: 1 | 2;
  rowSpacing: number;
  pitch: number;
  /** Put the second row on the other side of the first. */
  flipRows?: boolean;
  normal: Vec3;
  gender: PinGender;
  /** Type given to pins that have no override. */
  type: PinType;
  /** Per-pin changes, keyed by pin index (column * rows + row). */
  overrides: Record<string, StripPinOverride>;
}

export interface BoardShape {
  kind: 'box' | 'cyl';
  /** Centre of the shape. */
  pos: Vec3;
  /** Box: x, y, z size. Cylinder: diameter, diameter, height. */
  size: Vec3;
  /** Cylinder axis. Default z. */
  axis?: 'x' | 'y' | 'z';
  /** Rotation about Z in degrees (boxes). */
  rot?: number;
  color: string;
}

/** A model drawn from simple shapes. Used for breadboards and the bundled boards. */
export interface BoardSpec {
  shapes: BoardShape[];
}

export type PartModel = { kind: 'glb'; file: string } | { kind: 'board'; spec: BoardSpec };

export interface BBox {
  min: Vec3;
  max: Vec3;
}

export const PART_CATEGORIES = [
  'Microcontroller',
  'Single-board computer',
  'USB adapter',
  'Breadboard',
  'Sensor / module',
  'Custom hardware',
  'Other',
] as const;

export interface Part {
  id: string;
  name: string;
  category: string;
  model: PartModel;
  /** File name of the thumbnail image, if one was stored. */
  thumb?: string;
  builtin?: boolean;
  isBreadboard?: boolean;
  /** Voltage of the board's logic signals. */
  logicVoltage: 3.3 | 5;
  /** Male pins of this part push into breadboard holes. */
  plugsIntoBreadboard?: boolean;
  /** How far the part sinks into a breadboard when plugged in. */
  plugDepth?: number;
  bbox: BBox;
  /** Pins placed one by one. */
  pins: Pin[];
  strips: Strip[];
  /** Where the model came from, shown in the library. */
  note?: string;
  updatedAt?: string;
}

export interface Instance {
  id: string;
  partId: string;
  name: string;
  x: number;
  y: number;
  /** Height offset above the bench. */
  z: number;
  /** Degrees about Z, in 90° steps. */
  rotZ: number;
}

export interface PinRef {
  instanceId: string;
  pinId: string;
}

export interface Cable {
  id: string;
  from: PinRef;
  to: PinRef;
  color: string;
  /** False once the user has picked a colour by hand. */
  autoColor: boolean;
  label: string;
  /** Extra points the wire passes through, in bench coordinates. */
  controlPoints: Vec3[];
}

export interface SetupDoc {
  name: string;
  instances: Instance[];
  cables: Cable[];
}

export interface SetupMeta {
  id: string;
  name: string;
  version: number;
  shareToken: string;
  updatedAt: string;
  createdAt: string;
  thumb?: string;
}

export interface Setup extends SetupMeta {
  doc: SetupDoc;
}

export type PartsById = Record<string, Part>;
