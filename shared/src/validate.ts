import type { Part, PartsById, Pin, PinRef, SetupDoc } from './types';
import { isPower, isSignal } from './cable';
import { buildNetlist, SetupIndex, type Net, type Netlist, type ResolvedPin } from './netlist';
import { partPins } from './strip';

export type IssueRule =
  | 'power-short'
  | 'supply-conflict'
  | 'voltage-mismatch'
  | 'no-ground'
  | 'no-power'
  | 'dangling-cable'
  | 'rf-wrong-pin'
  | 'rf-port-crowded';

export interface Issue {
  id: string;
  rule: IssueRule;
  severity: 'error' | 'warning';
  title: string;
  message: string;
  cableIds: string[];
  pins: PinRef[];
  instanceIds: string[];
}

/** True when the pin must not see more than 3.3 V. */
export function is33Only(pin: Pin, part: Part): boolean {
  if (pin.voltageLimit === 3.3) return true;
  if (pin.voltageLimit === 5) return false;
  return part.logicVoltage === 3.3 && isSignal(pin.type);
}

/** True when the pin can put 5 V on a wire. */
export function drives5V(pin: Pin, part: Part): boolean {
  if (pin.type === '5V') return true;
  return part.logicVoltage === 5 && isSignal(pin.type) && !part.isBreadboard;
}

const label = (r: ResolvedPin): string => `${r.instance.name} · ${r.pin.name}`;

function checkNet(net: Net, issues: Issue[]): void {
  const base = {
    cableIds: net.cableIds,
    instanceIds: [...new Set(net.pins.filter((p) => !p.part.isBreadboard).map((p) => p.instance.id))],
  };
  const grounds = net.pins.filter((p) => p.pin.type === 'GND');
  const powers = net.pins.filter((p) => isPower(p.pin.type));

  if (grounds.length > 0 && powers.length > 0) {
    issues.push({
      id: `power-short:${net.id}`,
      rule: 'power-short',
      severity: 'error',
      title: 'Power is shorted to ground',
      message: `${label(powers[0])} is connected to ${label(grounds[0])}.`,
      pins: [powers[0].ref, grounds[0].ref],
      ...base,
    });
  }

  const five = powers.find((p) => p.pin.type === '5V');
  const three = powers.find((p) => p.pin.type === '3V3');
  if (five && three) {
    issues.push({
      id: `supply-conflict:${net.id}`,
      rule: 'supply-conflict',
      severity: 'error',
      title: '5 V and 3.3 V are tied together',
      message: `${label(five)} is connected to ${label(three)}.`,
      pins: [five.ref, three.ref],
      ...base,
    });
  }

  const driver = net.pins.find((p) => drives5V(p.pin, p.part));
  if (driver) {
    for (const victim of net.pins) {
      if (victim === driver || victim.pin.type === '3V3' || !is33Only(victim.pin, victim.part)) continue;
      issues.push({
        id: `voltage-mismatch:${victim.key}`,
        rule: 'voltage-mismatch',
        severity: 'warning',
        title: '5 V reaches a 3.3 V pin',
        message: `${label(driver)} can put 5 V on ${label(victim)}, which is 3.3 V only. Use a level shifter or a divider.`,
        pins: [driver.ref, victim.ref],
        ...base,
      });
    }
  }
}

function checkBoards(doc: SetupDoc, parts: PartsById, netlist: Netlist, issues: Issue[]): void {
  // For each board: is it wired to another board at all, and through which kinds of pin?
  const wired = new Set<string>();
  const grounded = new Set<string>();
  const powered = new Set<string>();
  for (const net of netlist.nets) {
    const active = net.pins.filter((p) => !p.part.isBreadboard);
    const boards = new Set(active.map((p) => p.instance.id));
    if (boards.size < 2) continue;
    // A coax cable between two boards joins their grounds through its shield.
    const rfBoards = new Set(active.filter((p) => p.pin.type === 'RF').map((p) => p.instance.id));
    for (const p of active) {
      wired.add(p.instance.id);
      if (p.pin.type === 'GND') grounded.add(p.instance.id);
      if (p.pin.type === 'RF' && rfBoards.size >= 2) grounded.add(p.instance.id);
      if (isPower(p.pin.type)) powered.add(p.instance.id);
    }
  }
  for (const inst of doc.instances) {
    const part = parts[inst.partId];
    if (!part || part.isBreadboard || !wired.has(inst.id)) continue;
    const pins = partPins(part);
    if (pins.some((p) => p.type === 'GND') && !grounded.has(inst.id)) {
      issues.push({
        id: `no-ground:${inst.id}`,
        rule: 'no-ground',
        severity: 'warning',
        title: 'No ground connection',
        message: `${inst.name} is wired to other boards but none of its GND pins is connected. Boards need a common ground.`,
        cableIds: [],
        pins: [],
        instanceIds: [inst.id],
      });
    }
    const hasUsb = pins.some((p) => p.type === 'USB');
    if (!hasUsb && pins.some((p) => isPower(p.type)) && !powered.has(inst.id)) {
      issues.push({
        id: `no-power:${inst.id}`,
        rule: 'no-power',
        severity: 'warning',
        title: 'No power connection',
        message: `${inst.name} has no USB port and none of its power pins is connected.`,
        cableIds: [],
        pins: [],
        instanceIds: [inst.id],
      });
    }
  }
}

/** RF ports take coax, one cable each. */
function checkRf(doc: SetupDoc, index: SetupIndex, issues: Issue[]): void {
  const onPort = new Map<string, { port: ResolvedPin; cableIds: string[] }>();
  for (const cable of doc.cables) {
    const a = index.resolve(cable.from);
    const b = index.resolve(cable.to);
    if (!a || !b) continue;
    for (const end of [a, b]) {
      if (end.pin.type !== 'RF') continue;
      const entry = onPort.get(end.key) ?? { port: end, cableIds: [] };
      entry.cableIds.push(cable.id);
      onPort.set(end.key, entry);
    }
    if ((a.pin.type === 'RF') !== (b.pin.type === 'RF')) {
      const rf = a.pin.type === 'RF' ? a : b;
      const other = rf === a ? b : a;
      issues.push({
        id: `rf-wrong-pin:${cable.id}`,
        rule: 'rf-wrong-pin',
        severity: 'error',
        title: 'RF port wired to an ordinary pin',
        message: `${label(rf)} is an RF port, but ${label(other)} is not. A coax cable only joins two RF ports.`,
        cableIds: [cable.id],
        pins: [rf.ref, other.ref],
        instanceIds: [...new Set([rf.instance.id, other.instance.id])],
      });
    }
  }
  for (const { port, cableIds } of onPort.values()) {
    if (cableIds.length < 2) continue;
    issues.push({
      id: `rf-port-crowded:${port.key}`,
      rule: 'rf-port-crowded',
      severity: 'error',
      title: 'RF port has more than one cable',
      message: `${label(port)} has ${cableIds.length} cables. A coax port takes one connector. Use a splitter to feed two paths.`,
      cableIds,
      pins: [port.ref],
      instanceIds: [port.instance.id],
    });
  }
}

export interface Analysis {
  index: SetupIndex;
  netlist: Netlist;
  issues: Issue[];
}

/** Build the nets of a setup and check them. */
export function analyse(doc: SetupDoc, parts: PartsById): Analysis {
  const index = new SetupIndex(doc, parts);
  const netlist = buildNetlist(doc, parts, index);
  const issues: Issue[] = [];

  for (const cable of netlist.dangling) {
    const ends = [cable.from, cable.to].filter((ref) => !index.resolve(ref));
    issues.push({
      id: `dangling-cable:${cable.id}`,
      rule: 'dangling-cable',
      severity: 'error',
      title: 'Cable has lost its pin',
      message: `${index.describe(cable.from)} to ${index.describe(cable.to)}: a pin this cable used was removed from the part. Reconnect or delete the cable.`,
      cableIds: [cable.id],
      pins: [],
      instanceIds: [...new Set(ends.map((e) => e.instanceId).filter((id) => index.instances.has(id)))],
    });
  }
  for (const net of netlist.nets) checkNet(net, issues);
  checkRf(doc, index, issues);
  checkBoards(doc, parts, netlist, issues);
  return { index, netlist, issues };
}
