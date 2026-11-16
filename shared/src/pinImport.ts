import { PIN_GENDERS, PIN_TYPES, RF_CONNECTORS, type Pin, type PinGender, type PinType, type RfConnector, type Strip, type Vec3 } from './types';
import { norm } from './vec';

export interface PinImport {
  pins: Pin[];
  strips: Strip[];
  errors: string[];
}

const TYPE_ALIASES: Record<string, PinType> = {
  '3.3V': '3V3',
  '3V': '3V3',
  VCC: '5V',
  GROUND: 'GND',
  SDA: 'I2C_SDA',
  SCL: 'I2C_SCL',
  TX: 'UART_TX',
  RX: 'UART_RX',
  MOSI: 'SPI_MOSI',
  MISO: 'SPI_MISO',
  SCK: 'SPI_SCK',
  CS: 'SPI_CS',
  DIGITAL: 'GPIO',
  IO: 'GPIO',
  COAX: 'RF',
  ANT: 'RF',
  ANTENNA: 'RF',
};

function parseType(raw: unknown): PinType | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return 'GPIO';
  const t = raw.trim().toUpperCase();
  if ((PIN_TYPES as readonly string[]).includes(t)) return t as PinType;
  return TYPE_ALIASES[t];
}

function parseGender(raw: unknown): PinGender {
  const g = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (PIN_GENDERS as string[]).includes(g) ? (g as PinGender) : 'male';
}

/** Reads "SMA", "bnc", "U.FL", "IPEX" and the like. Returns null for a name it does not know. */
function parseConnector(raw: unknown): RfConnector | undefined | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  const c = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if ((RF_CONNECTORS as readonly string[]).includes(c)) return c as RfConnector;
  if (c === 'IPEX' || c === 'IPX' || c === 'MHF') return 'UFL';
  if (c === 'NTYPE') return 'N';
  return null;
}

function parseLimit(raw: unknown): 3.3 | 5 | undefined {
  const n = Number(raw);
  return n === 3.3 ? 3.3 : n === 5 ? 5 : undefined;
}

function pinFromRecord(rec: Record<string, unknown>, where: string, newId: () => string, errors: string[]): Pin | undefined {
  const name = String(rec.name ?? '').trim();
  const x = Number(rec.x);
  const y = Number(rec.y);
  const z = Number(rec.z ?? 0);
  if (!name) {
    errors.push(`${where}: the pin has no name.`);
    return undefined;
  }
  if (![x, y, z].every(Number.isFinite)) {
    errors.push(`${where}: x, y and z must be numbers (pin "${name}").`);
    return undefined;
  }
  const type = parseType(rec.type);
  if (!type) {
    errors.push(`${where}: unknown type "${String(rec.type)}" (pin "${name}"). Use one of ${PIN_TYPES.join(', ')}.`);
    return undefined;
  }
  const nx = Number(rec.nx ?? 0);
  const ny = Number(rec.ny ?? 0);
  const nz = Number(rec.nz ?? 1);
  const normal = Array.isArray(rec.normal) ? (rec.normal.map(Number) as Vec3) : ([nx, ny, nz] as Vec3);
  const pin: Pin = { id: newId(), name, type, position: [x, y, z], normal: norm(normal), gender: parseGender(rec.gender) };
  const limit = parseLimit(rec.limit ?? rec.voltageLimit);
  if (limit) pin.voltageLimit = limit;
  if (type === 'RF') {
    const connector = parseConnector(rec.connector);
    if (connector === null) {
      errors.push(`${where}: unknown connector "${String(rec.connector)}" (pin "${name}"). Use one of ${RF_CONNECTORS.join(', ')}.`);
      return undefined;
    }
    pin.connector = connector ?? 'SMA';
  }
  return pin;
}

/** Split one CSV line, honouring quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Read pins from CSV. The first line names the columns: name, type, x, y, z are expected,
 * and gender, nx, ny, nz, limit, connector are optional.
 */
export function parsePinCsv(text: string, newId: () => string): PinImport {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) return { pins: [], strips: [], errors: ['The file needs a header line and at least one pin.'] };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  for (const col of ['name', 'x', 'y']) {
    if (!header.includes(col)) errors.push(`The header line has no "${col}" column.`);
  }
  if (errors.length) return { pins: [], strips: [], errors };
  const pins: Pin[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = splitCsvLine(line);
    const rec: Record<string, unknown> = {};
    header.forEach((h, k) => (rec[h] = cells[k]));
    const pin = pinFromRecord(rec, `Line ${i + 2}`, newId, errors);
    if (pin) pins.push(pin);
  });
  return { pins, strips: [], errors };
}

/** Read pins and strips from JSON: `{ "pins": [...], "strips": [...] }` or a plain array of pins. */
export function parsePinJson(text: string, newId: () => string): PinImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { pins: [], strips: [], errors: [`This is not valid JSON: ${(e as Error).message}`] };
  }
  const errors: string[] = [];
  const root = (Array.isArray(data) ? { pins: data } : data) as { pins?: unknown; strips?: unknown };
  const pins: Pin[] = [];
  if (Array.isArray(root?.pins)) {
    root.pins.forEach((raw, i) => {
      const rec = { ...(raw as Record<string, unknown>) };
      if (Array.isArray(rec.position)) [rec.x, rec.y, rec.z] = rec.position as number[];
      const pin = pinFromRecord(rec, `Pin ${i + 1}`, newId, errors);
      if (pin) pins.push(pin);
    });
  }
  const strips: Strip[] = [];
  if (Array.isArray(root?.strips)) {
    root.strips.forEach((raw, i) => {
      const s = raw as Partial<Strip>;
      const okVec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)));
      if (!okVec(s.start) || !okVec(s.end) || !Number.isFinite(Number(s.count))) {
        errors.push(`Strip ${i + 1}: start, end and count are required.`);
        return;
      }
      const pitch = Number(s.pitch) > 0 ? Number(s.pitch) : 2.54;
      strips.push({
        id: newId(),
        name: String(s.name ?? `J${i + 1}`),
        start: s.start.map(Number) as Vec3,
        end: s.end.map(Number) as Vec3,
        count: Math.max(1, Math.round(Number(s.count))),
        rows: s.rows === 2 ? 2 : 1,
        rowSpacing: Number(s.rowSpacing) > 0 ? Number(s.rowSpacing) : pitch,
        pitch,
        flipRows: Boolean(s.flipRows),
        normal: okVec(s.normal) ? norm(s.normal.map(Number) as Vec3) : [0, 0, 1],
        gender: parseGender(s.gender),
        type: parseType(s.type) ?? 'GPIO',
        ...(parseConnector(s.connector) ? { connector: parseConnector(s.connector) as RfConnector } : {}),
        overrides: typeof s.overrides === 'object' && s.overrides ? s.overrides : {},
      });
    });
  }
  if (pins.length === 0 && strips.length === 0 && errors.length === 0) errors.push('No pins or strips were found in the file.');
  return { pins, strips, errors };
}

/** The JSON a part's pins are exported as. Importing it again gives the same pins. */
export function exportPinJson(pins: Pin[], strips: Strip[]): string {
  return JSON.stringify(
    {
      pins: pins.map((p) => ({
        name: p.name,
        type: p.type,
        x: p.position[0],
        y: p.position[1],
        z: p.position[2],
        gender: p.gender,
        normal: p.normal,
        ...(p.voltageLimit ? { limit: p.voltageLimit } : {}),
        ...(p.connector ? { connector: p.connector } : {}),
      })),
      strips: strips.map(({ id: _id, ...rest }) => rest),
    },
    null,
    2,
  );
}
