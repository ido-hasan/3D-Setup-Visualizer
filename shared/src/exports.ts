import type { PartsById, SetupDoc } from './types';
import { cableGeometry, cableKind, cableLength, cableTypeLabel, standardCoaxLength, standardJumperLength } from './cable';
import { SetupIndex } from './netlist';

export interface WiringRow {
  n: number;
  cableId: string;
  fromBoard: string;
  fromPin: string;
  toBoard: string;
  toPin: string;
  color: string;
  label: string;
  type: string;
  lengthMm: number | null;
}

export function wiringList(doc: SetupDoc, parts: PartsById, index = new SetupIndex(doc, parts)): WiringRow[] {
  return doc.cables.map((cable, i) => {
    const a = index.resolve(cable.from);
    const b = index.resolve(cable.to);
    return {
      n: i + 1,
      cableId: cable.id,
      fromBoard: a?.instance.name ?? index.instances.get(cable.from.instanceId)?.name ?? '(missing)',
      fromPin: a?.pin.name ?? '(missing pin)',
      toBoard: b?.instance.name ?? index.instances.get(cable.to.instanceId)?.name ?? '(missing)',
      toPin: b?.pin.name ?? '(missing pin)',
      color: cable.color,
      label: cable.label,
      type: a && b ? cableTypeLabel(a.pin, b.pin) : '',
      lengthMm: a && b ? Math.round(cableLength(a, b, cable.controlPoints, cableGeometry(a.pin, b.pin))) : null,
    };
  });
}

export interface BomLine {
  kind: 'board' | 'cable';
  item: string;
  qty: number;
}

/** Boards by part, and cables by end type and the standard length that reaches. */
export function billOfMaterials(doc: SetupDoc, parts: PartsById, index = new SetupIndex(doc, parts)): BomLine[] {
  const boards = new Map<string, number>();
  for (const inst of doc.instances) {
    const name = parts[inst.partId]?.name ?? '(missing part)';
    boards.set(name, (boards.get(name) ?? 0) + 1);
  }
  const cables = new Map<string, number>();
  for (const cable of doc.cables) {
    const a = index.resolve(cable.from);
    const b = index.resolve(cable.to);
    if (!a || !b) continue;
    const kind = cableKind(a.pin, b.pin);
    const length = cableLength(a, b, cable.controlPoints, cableGeometry(a.pin, b.pin));
    const item =
      kind === 'usb'
        ? 'USB cable'
        : kind === 'coax'
          ? `Coax cable ${cableTypeLabel(a.pin, b.pin)}, ${standardCoaxLength(length)}`
          : `Jumper wire ${cableTypeLabel(a.pin, b.pin)}, ${standardJumperLength(length)}`;
    cables.set(item, (cables.get(item) ?? 0) + 1);
  }
  const sorted = (m: Map<string, number>, kind: BomLine['kind']): BomLine[] =>
    [...m.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([item, qty]) => ({ kind, item, qty }));
  return [...sorted(boards, 'board'), ...sorted(cables, 'cable')];
}

const cell = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Array<Array<string | number | null>>): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function wiringCsv(rows: WiringRow[]): string {
  return toCsv([
    ['#', 'From board', 'From pin', 'To board', 'To pin', 'Colour', 'Label', 'Type', 'Length (mm)'],
    ...rows.map((r) => [r.n, r.fromBoard, r.fromPin, r.toBoard, r.toPin, r.color, r.label, r.type, r.lengthMm]),
  ]);
}

export function bomCsv(lines: BomLine[]): string {
  return toCsv([['Kind', 'Item', 'Quantity'], ...lines.map((l) => [l.kind, l.item, l.qty])]);
}
